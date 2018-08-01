const fs = require('fs');
const path = require('path');
const sassResolver = require('./sassResolver');

const loaderUtils = require('loader-utils');

class SergeantPluginLoader {
	constructor(loaderContext) {
		this.loaderApi = loaderContext;

		this.silentFail = false;

		// We need the paths be relative to the project root (package.json or better ~Gruntfile.js), where the plugins have been configured.
		// Using `this.loaderApi.context` leads to problems when resolving a plugin with relative path, as `this.loaderApi.context` will be `src/js` in case of JS files and `src/sass` in case of Sass files
		this.context = process.cwd();

		// Patterns to check the source code against
		// We should always have 2 capturing groups in the regex: ['sergeant-plugins-core', 'core']
		this.regexes = {
			js: {
				require: /require\s?\(['|"](sergeant-plugins-(.*?))['|"]\);?/g, // require(), ' or ", ; at the end or not, eg: require('sergeant-plugins-core');
				import: /import\s?['|"](sergeant-plugins-(.*?))['|"];?/g // import, ' or ", ; at the end or not, eg: import 'sergeant-plugins-core';
			},
			sass: {
				import: /@import\s?['|"](sergeant-plugins-(.*?))['|"];?/g // @import, ' or ", ; at the end or not, eg: @import 'sergeant-plugins-core';
			}
		};

		this.comments = {
			js: {
				open: '/*',
				close: '*/'
			},
			sass: {
				open: '/*',
				close: '*/'
			}
		};

		// Needs to be defined by default!
		// this.plugins = []
		// Can be a relative (`../../`) or absolute path (`C:\\...`), or a module request()
		this.plugins = ['D:\\localhost\\sergeant-sandbox\\plugin-3', './public/plugin-4', 'plugin-1', 'plugin-2']
	}

	/**
	 * Removes comments from the `content`
	 *
	 * @url https://stackoverflow.com/a/15123777/3111787 (Hope, that 98% will be enough for us...)
	 * @param content
	 * @return {string | void | *}
	 */
	removeComments(content) {
		return content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
	}

	modeFromExt(ext) {
		ext = ext.replace('.', ''); // probably more safe than `ext.substr(1)`

		switch (ext) {
			case 'scss':
				return 'sass';

			default:
				return ext;
		}
	}

	/**
	 * Checks whether the given path is a relative request or a module call
	 * @param filePath
	 * @return {boolean}
	 */
	static isModulePath(filePath) {
		// If not a relative path
		if (filePath.startsWith('.')) return false;

		// If not absolute path (https://stackoverflow.com/a/24225816/3111787)
		if (path.resolve(filePath) === path.normalize(filePath).replace(/[\/|\\]$/, '')) return false;

		return true;
	}

	resolveSass(filePath) {
		const importer = sassResolver(this.context, this.loaderApi.resolve);

		// If we have a relative path, we need to resolve it here, as we need to resolve it relatively to the Gruntfile.js (~`process.cwd()`)
		if (filePath.startsWith('.')) filePath = path.resolve(this.context, filePath);

		// Add the usual '~' module notation for the sass resolver in case `path` is a module path
		if (SergeantPluginLoader.isModulePath(filePath)) filePath = '~' + filePath;

		return new Promise(resolve => {
			importer(filePath, this.loaderApi.context, value => {
				resolve(value.file)
			})
		});
	}

	resolveJs(filePath) {
		return new Promise(resolve => {
			this.loaderApi.resolve(this.context, filePath, (err, result) => {
				if (err) {
					if (this.silentFail === false) this.loaderApi.emitError(new Error(err));

					// We need to resolve also if there was an error in the file resolution (~file not found), as otherwise the whole Promise.all() block will fail in `generateRawImports()`
					resolve();
				} else {
					resolve(result)
				}
			});
		});
	}

	getPathToImport(plugin, pluginType, lang) {
		if (pluginType === undefined) throw new Error('getPathToImport - type must be set!');

		// We cannot use path.join(), as it modifies even the beginning of the path, eg. `path.join('./something', 'core')` will be `something/core`.
		// This doesn't let us to use relative plugin imports
		const filePath = plugin + '/' + pluginType;

		switch (lang) {
			case 'sass':
				return this.resolveSass(filePath);
			case 'js':
				return this.resolveJs(filePath);
		}
	}

	/**
	 * Creates the raw import strings for every module, using exactly the same import notation (eg. `import 'xy'` or `require('xy)` or `@import 'xy'`), as the rawImport string.
	 *
	 * @param rawImport The raw import string (eg. `require('sergeant-plugins-core');`)
	 * @param patternToReplace The sergeant module importation string pattern (eg. `sergeant-plugins-core`)
	 * @param importType The type of the plugin files to be imported (eg. `core` or `footprint`)
	 * @param lang The language of the file (eg. `js`)
	 * @return {*}
	 */
	generateRawImports({rawImport, patternToReplace, importType, lang}) {
		const newImports = [];

		// Adding some comments to the source
		const comments = this.comments[lang];
		newImports.push(comments.open + ' Sergeant plugins - ' + importType + ' files ' + comments.close);

		const pathPromises = this.plugins.map(plugin => this.getPathToImport(plugin, importType, lang));

		return new Promise((resolve, reject) => {
			Promise.all(pathPromises).then(resolvedPaths => {
				resolvedPaths.map(pluginPath => {
					// We check if the `pluginPath` exists, and we add it to the import list only if so
					if (pluginPath !== undefined && fs.existsSync(pluginPath)) {
						// Fixing the `backslash-in-path` problem, which occurs on Windows machines
						// Do not forget that stringifyRequest returns a `JSON.stringify()`-ed value! :-)
						const fixedPluginPath = JSON.parse(loaderUtils.stringifyRequest(this.loaderApi, pluginPath));

						newImports.push(rawImport.replace(patternToReplace, fixedPluginPath))
					}
				});

				resolve({
					newImport: newImports.join('\n'),
					rawImport,
					patternToReplace,
					importType,
					lang
				});
			});
		});
	}

	/**
	 * Makes the modifications on the `content` (if needed) and returns it
	 *
	 * @param content
	 * @param map
	 * @param meta
	 * @return {Promise<string>}
	 */
	apply(content, map, meta) {
		const ext = path.extname(this.loaderApi.resourcePath);
		const lang = this.modeFromExt(ext);
		const langRegexes = this.regexes[lang];

		// Remove comments from the `content`, in order not to import commented out imports
		const uncommented = this.removeComments(content);

		return new Promise((resolve, reject) => {
			// This will contain the Promises returned from `this.generateRawImports`
			const replaceQueue = [];

			// We are iterating over the possible regexes (like `import 'xy'` or `require('xy')`) and checking the raw code against them
			Object.keys(langRegexes).forEach(key => {
				const regexp = langRegexes[key];
				let matches;

				// Find all the possible imports (if there's more), which mach this RegExp (otherwise we would just get the first instance - https://stackoverflow.com/a/5283091/3111787)
				while ((matches = regexp.exec(uncommented)) !== null) {
					replaceQueue.push(this.generateRawImports({rawImport: matches[0], patternToReplace: matches[1], importType: matches[2], lang}));
				}
			});

			// If we have found any plugin import notation
			if (replaceQueue.length) {
				Promise.all(replaceQueue).then(newImports => {
					// Replace all the collected imports in the content and return it.
					newImports.map(newImport => content = content.replace(newImport.rawImport, newImport.newImport));
					resolve(content)
				});
			}

			// Otherwise return the content untouched
			else {
				resolve(content);
			}
		});
	}
}

module.exports = SergeantPluginLoader;