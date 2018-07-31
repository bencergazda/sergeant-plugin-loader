const SergeantPluginLoader = require('./SergeantPluginLoader');

module.exports = function loader(content, map, meta) {
	const sergeantPluginLoader = new SergeantPluginLoader(this);
	const callback = this.async();

	sergeantPluginLoader.apply(content, {
		resourcePath: this.resourcePath
	}).then((newContent, err) => {
		if (err) return callback(err);

		callback(null, newContent, map, meta);
	});
};