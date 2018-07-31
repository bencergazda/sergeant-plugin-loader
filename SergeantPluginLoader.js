const path = require('path');
// const sassResolver = require('./sassResolver');

class SergeantPluginLoader {
	constructor(loaderContext) {
		this.resolve = loaderContext.resolve;

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
		this.plugins = ['./plugin-1', './plugin-2']
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
		// const importer = sassResolver(path, this.resolve);
		//
		// return new Promise(resolve => {
		// 	importer(path, path, value => {
		// 		// console.log(value.file);
		// 		resolve(value.file)
		// 	})
		// });
	}

	resolveJs(path) {
		// TODO Ezt valahogy megoldani!! (Az egészet async-ká kellene tenni
		return this.resolve(process.cwd(), path, bla => {
			console.log(bla)
		});
	}

	getPathToImport(plugin, pluginType, lang) {
		if (pluginType === undefined) throw new Error('getPathToImport - type must be set!');

		const filePath = path.join(plugin, pluginType);

		let resolvedPath;

		switch (lang) {
			case 'sass':
				resolvedPath = this.resolveSass(filePath);
				break;
			case 'js':
				resolvedPath = this.resolveJs(filePath);
				break;
		}

		return resolvedPath;
	}

	/**
	 *
	 * @param content Raw filedata
	 * @param rawImport The raw import string (eg. `require('sergeant-plugins-core');`)
	 * @param patternToReplace The sergeant module importation string pattern (eg. `sergeant-plugins-core`)
	 * @param pluginType The type of the files to be imported (eg. `core`)
	 * @param lang The language of the file (eg. `js`)
	 * @return {*}
	 */
	replaceImports(content, {rawImport, patternToReplace, pluginType, lang}) {
		const newImports = [];

		// Adding some comments to the source
		const comments = this.comments[lang];
		newImports.push(comments.open + ' Sergeant plugins - ' + pluginType + ' files ' + comments.close);

		this.plugins.map(item => {
			const pluginPath = this.getPathToImport(item, pluginType, lang);

			if (pluginPath === undefined) return;

			newImports.push(rawImport.replace(patternToReplace, pluginPath))
		});

		return content.replace(rawImport, newImports.join('\n'));
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

		// We are iterating over the possible regexes and checking the raw code against them
		Object.keys(langRegexes).forEach(key => {
			const regexp = langRegexes[key];
			const matches = regexp.exec(content);

			if (matches === null) return;

			content = this.replaceImports(content, {rawImport: matches[0], patternToReplace: matches[1], pluginType: matches[2], lang, resourcePath})
		});

		return content;
	}
}

module.exports = SergeantPluginLoader;