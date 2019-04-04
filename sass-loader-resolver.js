const sassLoaderResolver = require('./sassResolver');

/**
 * Sass importer function for resolving files by using `sass-loader`'s module resolution (for eaxample, resolving `~`).
 *
 * @param url
 * @param prev
 * @param done
 */
module.exports = function importer(url, prev, done) {
	const loaderContext = this.loaderContext;
	const sassImporter = sassLoaderResolver(loaderContext.resourcePath, loaderContext.resolve);

	return sassImporter(url, prev, done);
};