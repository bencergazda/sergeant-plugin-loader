const SergeantPluginLoader = require('./SergeantPluginLoader');

/**
 * Sass loader for resolving Sergeant's plugin imports
 *
 * @param content
 * @param map
 * @param meta
 */
module.exports = function loader(content, map, meta) {
	const sergeantPluginLoader = new SergeantPluginLoader(this);
	const callback = this.async();

	const imports = sergeantPluginLoader.collectImportStatements(content);
	const pluginImportStatements = sergeantPluginLoader.filterPluginImportStatements(imports);

	// If we have found any Sergeant plugin import notation
	if (pluginImportStatements.length) {
		sergeantPluginLoader.replaceImports(content, pluginImportStatements)
			// Return the processed content, if we received, or the untouched content
			.then(processedContent => callback(null, processedContent, map, meta))
			.catch((err) => callback(err));
	} else {
		callback(null, content, map, meta);
	}
};