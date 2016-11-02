// no cache 
var NoCache = function(){}
NoCache.prototype.get = function (url, callback) {
	if (typeof callback === 'function') {
		callback(null);		
	}
	return null;
};

NoCache.prototype.getHeaders = function (url, callback) {
	if (typeof callback === 'function') {
		callback(null); 
	}
	return null;
};

NoCache.prototype.set = function (url, headers, body) {

};


// memory cache
var MemoryCache = function(options){
	options = options || {};
	this.cache = options.cache || {};
}

MemoryCache.prototype.get = function (url, callback) {
	var cache = this.cache[url];
	if (typeof callback === 'function') {
		callback(cache ? cache.body || null : null);
	}
	return cache ? cache.body || null : null;
	
}

MemoryCache.prototype.getHeaders = function(url, callback) {
	var cache = this.cache[url];
	if (typeof callback === 'function') {
		callback(cache? cache.headers || null : null);
	}
	return cache ? cache.headers || null : null;
	
}

MemoryCache.prototype.set = function(url, headers, body) {
	this.cache[url] = {headers: headers, body: body};
}


module.exports.NO_CACHE = exports.NO_CACHE = function() {
	return new NoCache();
}

module.exports.MemoryCache = exports.MemoryCache = MemoryCache;

module.exports.newMemoryCache = exports.newMemoryCache = function(options){
	return new MemoryCache(options || {});
}