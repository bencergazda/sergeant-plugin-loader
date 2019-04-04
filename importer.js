const SergeantPluginLoader = require('./SergeantPluginLoader');

/**
 * Sass importer function for resolving Sergeant's plugin imports
 *
 * @param url
 * @param prev
 * @param done
 */
module.exports = function importer(url, prev, done) {
	const sergeantPluginLoader = new SergeantPluginLoader(this.loaderContext);
	const importType = sergeantPluginLoader.getPluginImportType(url);

	// If `url` is a Sergeant plugin import notation
	if (importType !== null) {
		sergeantPluginLoader.collectFiles(importType).then(
			// Return an array of objects, each contains https://github.com/sass/node-sass/issues/2467
			resolvedImports => done(resolvedImports.map(resolvedImport => ({ file: resolvedImport })))
		);
	} else {
		// Return `null` to pass the responsibility back to other custom importers (as in https://github.com/sass/node-sass#importer--v200---experimental)
		// (Returning `{ file: url }`, as `sass-loader` does would skip any other importers, which would be bad for us)
		done(null);
	}
};