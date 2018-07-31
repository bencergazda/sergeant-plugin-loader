const pify = require('pify');
const path = require('path');
const sassResolver = require('./sassResolver');

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
	 *
	 * @param rawImport The raw import string (eg. `require('sergeant-plugins-core');`)
	 * @param patternToReplace The sergeant module importation string pattern (eg. `sergeant-plugins-core`)
	 * @param pluginType The type of the files to be imported (eg. `core`)
	 * @param lang The language of the file (eg. `js`)
	 * @return {*}
	 */
	replaceImports({rawImport, patternToReplace, pluginType, lang}) {
		const newImports = [];

		// Adding some comments to the source
		const comments = this.comments[lang];
		newImports.push(comments.open + ' Sergeant plugins - ' + pluginType + ' files ' + comments.close);

		const pathPromises = this.plugins.map(item => this.getPathToImport(item, pluginType, lang));

		return new Promise((resolve, reject) => {
			Promise.all(pathPromises).then(resolvedPaths => {
				resolvedPaths.map(pluginPath => {
					pluginPath = pluginPath.replace(/\\/g, '\\\\');
					newImports.push(rawImport.replace(patternToReplace, pluginPath))
				});

				resolve({
					newImport: newImports.join('\n'),
					rawImport,
					patternToReplace,
					pluginType,
					lang
				});
			});
		});
	}

	/**
	 * Created the modifications in the content and returns it
	 *
	 * @param content
	 * @param resourcePath
	 * @return {*}
	 */
	apply(content, {resourcePath}) {
		const ext = path.extname(resourcePath);
		const lang = this.modeFromExt(ext);
		const langRegexes = this.regexes[lang];

		// We are iterating over the possible regexes (like `import 'xy'` or `require('xy')`) and checking the raw code against them
		return new Promise((resolve, reject) => {
			const replacedImports = [];

			Object.keys(langRegexes).forEach(key => {
				const regexp = langRegexes[key];
				const matches = regexp.exec(content);

				if (matches === null) return;

				replacedImports.push(this.replaceImports({rawImport: matches[0], patternToReplace: matches[1], pluginType: matches[2], lang, resourcePath}));
			});

			if (!replacedImports.length) {
				resolve(content);
			} else {
				Promise.all(replacedImports).then(newImports => {
					newImports.map(newImport => {
						content = content.replace(newImport.rawImport, newImport.newImport);
					});

					resolve(content)
				});
			}
		});
	}
}

module.exports = SergeantPluginLoader;