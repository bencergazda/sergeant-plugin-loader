const sassLoaderResolver = require('./sassResolver');

module.exports = function importer(url, prev, done) {
	const loaderContext = this.loaderContext;
	const sassImporter = sassLoaderResolver(loaderContext.resourcePath, loaderContext.resolve);

	return sassImporter(url, prev, done);
};