const webpackImporter = require('sass-loader/lib/webpackImporter');
const pify = require('pify');

/**
 * A custom importer basing on the `sass-loader`'s webpackImporter, but using the provided resolver function
 *
 * @param resourcePath
 * @param resolve
 */
module.exports = function sassImporter(resourcePath, resolve) {
	const resolve_pify = pify(resolve);

	return webpackImporter(resourcePath, resolve_pify, function() {}); // will be a `function (url, prev, done) {}`
};