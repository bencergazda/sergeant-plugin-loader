const SergeantPluginLoader = require('./SergeantPluginLoader');

module.exports = function loader(content, map, meta) {
	const sergeantPluginLoader = new SergeantPluginLoader(this);
	const callback = this.async();

	sergeantPluginLoader.apply(content, map, meta).then(
		newContent => callback(null, newContent, map, meta),
		err => callback(err)
	);
};