
module.exports.copy = exports.copy = function(obj) {
	var copy = {};
	for(key in obj){
		copy[key] = obj[key];
	}
	return copy;
}