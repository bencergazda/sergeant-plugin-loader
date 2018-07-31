const SergeantPluginLoader = require('./SergeantPluginLoader');

module.exports = function loader(content, map, meta) {
	const sergeantPluginLoader = new SergeantPluginLoader(this);
	const callback = this.async();

	sergeantPluginLoader.apply(content, {
		resourcePath: this.resourcePath
	}).then(newContent => callback(null, newContent, map, meta)).catch(e => console.log('\nError: ', e));
};