const webpackImporter = require('sass-loader/lib/webpackImporter');
const pify = require('pify');

module.exports = function sassImporter (resourcePath, resolve) {
	const resolve_pify = pify(resolve);

	return webpackImporter(resourcePath, resolve_pify, function() {}); // will be a `function (url, prev, done) {}`
};