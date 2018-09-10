const sassLoaderResolver = require('./sassResolver');

module.exports = function importer(url, prev, done) {
	const loaderContext = this.loaderContext;
	const sassImporter = sassLoaderResolver(loaderContext.resourcePath, loaderContext.resolve);

	// sass-extract extractor importer
	if (this.caller === 'sass-extract') {
		return new Promise((resolve, reject) => {
			sassImporter(url, prev, function (val) {
				resolve(val);
			})
		})
	} else {
		return sassImporter(url, prev, done);
	}
};