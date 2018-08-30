const fs = require('fs');
const path = require('path');
const sassResolver = require('./sassResolver');
const loaderUtils = require('loader-utils');

class SergeantPluginLoader {
	constructor(loaderContext) {
		this.loaderContext = loaderContext;

		// We need the paths be relative to the project root (package.json or better ~Gruntfile.js), where the plugins have been configured.
		// Using `this.loaderContext.context` leads to problems when resolving a plugin with relative path, as `this.loaderContext.context` will be `src/js` in case of JS files and `src/sass` in case of Sass files
		this.context = process.cwd();

		// Patterns to check the source code against
		this.regexes = {
			// Finding the different import notations
			js: {
				require: /require\s?\(['"](.*)['"]\);?/g, // require(), ' or ", ; at the end or not, eg: require('...');
				import: /import\s?['"](.*)['"];?/g // import, ' or ", ; at the end or not, eg: import '...';
			},
			sass: {
				import: /@import\s?['"](.*)['"];?/g // @import, ' or ", ; at the end or not, eg: @import '...';
			},
			// And finding the sergeant plugin import paths in them
			importPath: /sergeant-plugins\/(.*)/g // We should always have 2 capturing groups in the regex: ['sergeant-plugins-core', 'core']
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

		// List of the plugin paths (can be a relative (`../../`) or absolute path (`C:\\...`), or a module request string)
		this.plugins = [...process.sergeantConfig.sergeant.plugins];
	}

	/**
	 * Removes comments from the `content`
	 *
	 * @url https://stackoverflow.com/a/15123777/3111787 (Hope, that 98% will be enough for us...)
	 * @param content
	 * @return {string | void | *}
	 */
	static removeComments(content) {
		return content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
	}

	/**
	 * Checks whether the given path is a relative request or a module call
	 *
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

	/**
	 * Returns the plugin import type if `path` is a plugin import notation, or `null`, if not (`core` for `sergeant-plugins/core` and `null` for `./anyOtherImportPath`)
	 *
	 * @param path
	 * @return {string|null}
	 */
	getPluginImportType(path) {
		const match = new RegExp(this.regexes.importPath).exec(path);

		return (match !== null) ? match[1] : null;
	}

	/**
	 * Returns the language of the loader's resourcePath extension (`js` for `.js`, `sass` for `.scss`)
	 *
	 * @return {string}
	 */
	get resourceLang () {
		const ext = path.extname(this.loaderContext.resourcePath).replace('.', ''); // probably more safe than `ext.substr(1)`

		switch (ext) {
			case 'scss':
				return 'sass';

			default:
				return ext;
		}
	}

	/**
	 * Tries to resolve the given filePath with a custom Sass importer, using `sass-loader`, following the Sass import resolution algorithm (https://jonathantneal.github.io/sass-import-resolve/)
	 *
	 * @param filePath
	 * @return {Promise<String>} Resolved file path for one Sass file
	 */
	resolveSass(filePath) {
		return new Promise(resolve => {
			const importer = sassResolver(this.context, this.loaderContext.resolve);

			// If we have a relative path, we need to resolve it here, as we need to resolve it relatively to the Gruntfile.js (~`process.cwd()`)
			if (filePath.startsWith('.')) filePath = path.resolve(this.context, filePath);

			// Add the usual '~' module notation for the sass resolver in case `path` is a module path
			if (SergeantPluginLoader.isModulePath(filePath)) filePath = '~' + filePath;

			importer(filePath, this.loaderContext.context, value => {
				resolve(value.file)
			})
		});
	}

	/**
	 * Tries to resolve the given file with the loader's resolve method
	 *
	 * @param filePath
	 * @return {Promise<String>} Resolved file path for one JS file
	 */
	resolveJs(filePath) {
		return new Promise(resolve => {
			this.loaderContext.resolve(this.context, filePath, (err, result) => {
				if (err) {
					// We need to resolve also if there was an error in the file resolution (~file not found), as otherwise the whole Promise.all() block will fail in `generateRawImports()`
					resolve();
				} else {
					resolve(result)
				}
			});
		});
	}

	/**
	 * Router function to pass the resolve job to the corresponding, language-specific resolver
	 *
	 * @param plugin Path for the plugin folder (eg. `plugin-1` or `./public/plugin-4`)
	 * @param importType Type of the file to be resolved (eg. `core` or `footprint`)
	 * @param lang The type of the file to be resolved (eg. `js` or `sass`)
	 * @return {Promise<String>} Resolved file path for one plugin file
	 */
	resolve(plugin, importType, lang) {
		if (importType === undefined) throw new Error('Sergeant plugin loader resolve - type must be set!');

		// We cannot use path.join(), as it modifies even the beginning of the path, eg. `path.join('./something', 'core')` will be `something/core`.
		// This doesn't let us to use relative plugin imports
		const filePath = plugin + '/' + importType;

		switch (lang) {
			case 'sass':
				return this.resolveSass(filePath);
			case 'js':
				return this.resolveJs(filePath);
			default:
				throw new Error('resolve - could not find appropriate plugin resolver for lang `' + lang + '`')
		}
	}

	/**
	 * Returns an array with all the resolved plugin-files for the given import type
	 *
	 * @param importType Type of the file to be resolved (eg. `core` or `footprint`)
	 * @return {Promise<Array>}
	 */
	collectFiles(importType) {
		return new Promise((resolve, reject) => {
			const collection = [];

			// Collecting all the available files
			const pathPromises = this.plugins.map(plugin => this.resolve(plugin, importType, this.resourceLang));

			Promise.all(pathPromises).then(resolvedPaths => {
				resolvedPaths.map(pluginPath => {
					// We check if the `pluginPath` exists, and we add it to the import list only if so
					if (pluginPath !== undefined && fs.existsSync(pluginPath)) {
						// Fixing the `backslash-in-path` problem, which occurs on Windows machines
						// Do not forget that stringifyRequest returns a `JSON.stringify()`-ed value! :-)
						const fixedPluginPath = JSON.parse(loaderUtils.stringifyRequest(this.loaderContext, pluginPath));

						collection.push(fixedPluginPath)
					}
				});

				resolve(collection);
			});
		});
	}

	/**
	 * Creates the raw import strings for every module, using exactly the same import notation (eg. `import 'xy'` or `require('xy)` or `@import 'xy'`), as the rawImport string.
	 *
	 * @param rawImport The raw import string (eg. `require('sergeant-plugins-core');`)
	 * @param path The sergeant module importation string pattern (eg. `sergeant-plugins-core`)
	 * @param lang The language of the file (eg. `js`)
	 * @return {*}
	 */
	generateRawImports({rawImport, path}, lang) {
		const importType = this.getPluginImportType(path);

		const newImports = [];

		// Adding some comments to the source
		const comments = this.comments[lang];
		newImports.push(comments.open + ' Sergeant plugins - ' + importType + ' files ' + comments.close);

		const pathPromises = this.plugins.map(plugin => this.resolve(plugin, importType, lang));

		return new Promise((resolve, reject) => {
			Promise.all(pathPromises).then(resolvedPaths => {
				resolvedPaths.map(pluginPath => {
					// We check if the `pluginPath` exists, and we add it to the import list only if so
					if (pluginPath !== undefined && fs.existsSync(pluginPath)) {
						// Fixing the `backslash-in-path` problem, which occurs on Windows machines
						// Do not forget that stringifyRequest returns a `JSON.stringify()`-ed value! :-)
						const fixedPluginPath = JSON.parse(loaderUtils.stringifyRequest(this.loaderContext, pluginPath));

						newImports.push(rawImport.replace(path, fixedPluginPath))
					}
				});

				resolve({rawImport, newImport: newImports.join('\n')});
			});
		});
	}

	/**
	 * Parses the given raw file content and extracts all the valid (eg. not commented out) import statements
	 *
	 * @param content
	 * @return {Array} `[{ rawImport: 'import "./sergeant";', path: './sergeant' }]` in case of `import "./sergeant";`
	 */
	collectImports(content) {
		const langRegexes = this.regexes[this.resourceLang];

		// Remove comments from the `content`, in order not to import commented out imports
		const uncommented = SergeantPluginLoader.removeComments(content);

		// This will contain the Promises returned from `this.generateRawImports`
		const foundImports = [];

		// We are iterating over the possible regexes (like `import 'xy'` or `require('xy')`) and checking the raw code against them
		Object.keys(langRegexes).forEach(key => {
			const regexp = new RegExp(langRegexes[key]);
			let matches;

			// Find all the possible imports (if there's more), which mach this RegExp (otherwise we would just get the first instance - https://stackoverflow.com/a/5283091/3111787)
			while ((matches = regexp.exec(uncommented)) !== null) {
				foundImports.push({rawImport: matches[0], path: matches[1]});
			}
		});

		return foundImports;
	}

	/**
	 * Returns only the Sergeant plugin imports from the given importPath Array (eg. [{ rawImport: 'import "./sergeant";', path: './sergeant' }])
	 *
	 * @param arr
	 * @return {Array}
	 */
	filterPluginImports(arr = []) {
		const returnData = [];

		arr.forEach(item => {
			if (this.getPluginImportType(item.path) !== null) {
				returnData.push(item)
			}
		});

		return returnData;
	}

	/**
	 * Replaces the imports from `pluginImports` with the resolved import notations in `content`
	 *
	 * @param content
	 * @param pluginImports Array returned from this.collectImports() or this.filterPluginImports()
	 * @return {Promise<String>}
	 */
	replaceImports(content, pluginImports) {
		return new Promise((resolve, reject) => {
			// This will contain the Promises returned from `this.generateRawImports`
			const replaceQueue = pluginImports.map(pluginImport => this.generateRawImports(pluginImport, this.resourceLang));

			// If we have found any plugin import notation
			Promise.all(replaceQueue).then(newImports => {
				// Replace all the collected imports in the content and return it.
				newImports.map(newImport => content = content.replace(newImport.rawImport, newImport.newImport));
				resolve(content)
			});
		})
	}
}

module.exports = SergeantPluginLoader;