const SergeantPluginLoader = require('./SergeantPluginLoader');

module.exports = function loader(content) {
	const sergeantPluginLoader = new SergeantPluginLoader(this);

	return sergeantPluginLoader.apply(content, {
		resourcePath: this.resourcePath
	});
};