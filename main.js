const routes = require('routes');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

const urlParse = require('url').parse;
const urlResolve = require('url').resolve;

const cookieJar = require('cookiejar');
const request = require('request');
const cheerio = require('cheerio');

const cache = require('./lib/zpider-cache');
const agent = require('./lib/zpider-agent');
const tool = require('./lib/zpider-utils');


const HEADERS = {
	'accept': "application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5",
	'accept-language': 'en-US,en;q=0.8',
	'accept-charset':  'ISO-8859-1,utf-8;q=0.7,*;q=0.3'
};

const CONTENT_TYPE = 'html';

const LOG_EVENT = '___zpider_log___';
const LOG_LEVELS = {
	1: 'debug',
	10: 'info', 
	80: 'warn',
	100: 'error',
	1000: 'none',
	'debug': 1,
	'info': 10,
	'warn': 80,
	'error': 100,
	'none': 1000
};

/**
 * constructor
 */ 
var Zpider = function(options){
	var self = this;

	options = typeof options === 'object'? options : {};

	this.userAgent = options.userAgent || agent.FirefoxUserAgent;
	this.contentType = options.contentType || CONTENT_TYPE;
	this.routes = {};
	this.urls = [];
	this.cache = options.cache || cache.NO_CACHE();
	this.cookieJar = cookieJar.CookieJar();

	this.setLogLevel(options.logLevel || 'none');

	this.on(LOG_EVENT, function(level, text){
		level = typeof level === 'string' ? LOG_LEVELS[level] : level;
		if (self.logLevel <= level) {
			console.log('[%s] %s', LOG_LEVELS[level], text);
		}
	});
}

util.inherits(Zpider, EventEmitter);

Zpider.prototype.setLogLevel = function(level){
	this.logLevel = typeof level === 'string' ? LOG_LEVELS[level] : level;
}

Zpider.prototype.route = function (host, pattern, callback) {
	var self = this;
	self.emit(LOG_EVENT, 'debug', 'Tring to create router for host[' + host + '] pattern[' + pattern + ']');
	if (typeof host === 'string') {
		if (self.routes[host] === undefined) {
			self.routes[host] = new routes.Router();
		}
		self.routes[host].addRoute(pattern, callback);
		self.emit(LOG_EVENT, 'debug', 'Add host[' + host + '] router. with pattern[' + pattern + ']');
	} else {
		self.emit(LOG_EVENT, 'warn', 'Try to call Zpider.route() with unkonwn host [' + host + ']');
	}
}

Zpider.prototype.fetch = function(url, referer) {
	var self = this, headers = tool.copy(HEADERS);
	// deny reaccess
	if (0 <= self.urls.indexOf(url)) {
		self.emit(LOG_EVENT, 'debug', 'Already received data from ' + url + '. skipping.');
		return self;
	}

	self.emit(LOG_EVENT, 'debug', 'Remove url[' + url + '] from fetch list');
	self.urls.push(url);

	var uri = urlParse(url);
	if (!uri.host) {
		self.emit(LOG_EVENT, 'error', 'Parse url[' + url + '] failed. are you missing <http://> ?');
	}
	
	// no pattern for access
	if (!self.routes[uri.host]) {
		self.emit(LOG_EVENT, 'warn', 'No routes for host: ' + uri.host + '. skipping');
		return self;
	}

	var router = self.routes[uri.host];
	if (!router.match(uri.href.slice(uri.href.indexOf(uri.host) + uri.host.length))) {
		self.emit(LOG_EVENT, 'warn', 'No routes for path ' + uri.href.slice(uri.href.indexOf(uri.host) + uri.host.length) + '. skipping');
		return self;
	}

	// header setup.
	headers['user-agent'] = self.userAgent;

	var cache = self.cache.getHeaders(url, null);
	if (cache) {
		if (cache['last-modified']) {
			headers['if-modified-since'] = cache['last-modified'];
		}

		if (cache['etag']) {
			headers['if-none-match'] = cache['etag'];
		}
	}

	var cookies = self.cookieJar.getCookies(cookieJar.CookieAccessInfo(uri.host, uri.pathname));
	if (cookies) {
		headers.cookie = String(cookies);
	}

	self.emit(LOG_EVENT, 'debug', 'Request ' + url);
	request.get({
		url: url,
		headers: headers,
		pool: self.pool
	}, function(error, response, body){
		self.emit(LOG_EVENT, 'debug', 'Response received [' + url + ']');
		self.emit('data', response, url);

		if (response.statusCode !== 200) {
			self.emit(LOG_EVENT, 'warn', 'Response got StatusCode[' + response.statusCode + '] from ' + url);
			return;
		} else if (!response.headers['content-type'] || response.headers['content-type'].indexOf(self.contentType) === -1) {
			self.emit(LOG_EVENT, 'error', 'Response expect [' + self.contentType + '] but got [' + response.headers['content-type'] + ']');
			return;
		}

		if (response.headers['set-cookie']) {
			try {
				self.cookieJar.setCookies(response.headers['set-cookie']);
			} catch(e) {}
		}

		self.__responseHandler(url, referer, {headers: response.headers, body: body});
	})

}

Zpider.prototype.__responseHandler = function (url, referer, response) {
	var self = this, uri = urlParse(url);
	if (self.routes[uri.host]) {
		var result = self.routes[uri.host].match(uri.href.slice(uri.href.indexOf(uri.host) + uri.host.length));
		result.spider = self;
		result.response = response;
		result.url = url;

		result.$ = cheerio.load(response.body);
		result.$.fn.spider = function(){
			this.each(function(){
				var href = result.$(this).attr('href');
				if (/^https?:/.test(href) || /^\//.test(href)) {
					href = urlResolve(url, href);
					self.fetch(href, url);
				} 
			})
		}
		result.fn.call(result, result.$, result);
	}
};

module.exports = exports = function(options) {
	return new Zpider(options || {});
}