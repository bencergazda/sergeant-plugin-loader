const pify = require('pify');
const path = require('path');
const sassResolver = require('./sassResolver');

const loaderUtils = require('loader-utils');

class SergeantPluginLoader {
	constructor(loaderContext) {
		this.loaderApi = loaderContext;

		this.promisedResolve = pify(this.loaderApi.resolve.bind(this.loaderApi));

		// Patterns to check the source code against
		// We should always have 2 capturing groups in the regex: ['sergeant-plugins-core', 'core']
		// TODO This doesn't find duplicated same import types
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
		this.plugins = ['plugin-1', 'plugin-2']
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

	resolveSass(path) {
		const importer = sassResolver(this.loaderApi.context, this.promisedResolve);

		return new Promise(resolve => {
			importer(path, this.loaderApi.context, value => {
				resolve(value.file)
			})
		});
	}

	resolveJs(path) {
		return this.promisedResolve(this.loaderApi.context, path);
	}

	getPathToImport(plugin, pluginType, lang) {
		if (pluginType === undefined) throw new Error('getPathToImport - type must be set!');

		const filePath = path.join(plugin, pluginType);

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
					// Fixing the `backslash-in-path` problem, which occurs on Windows machines
					// Do not forget that stringifyRequest returns a `JSON.stringify()`-ed value! :-)
					pluginPath = JSON.parse(loaderUtils.stringifyRequest(this.loaderApi, pluginPath));
					newImports.push(rawImport.replace(patternToReplace, pluginPath))
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
	 * @param resourcePath
	 * @return {*}
	 */
	apply(content, {resourcePath}) {
		const ext = path.extname(resourcePath);
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
				const matches = regexp.exec(uncommented);

				if (matches === null) return;

				replaceQueue.push(this.generateRawImports({rawImport: matches[0], patternToReplace: matches[1], importType: matches[2], lang, resourcePath}));
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