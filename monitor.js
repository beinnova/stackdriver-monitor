var os = require('os');
var exec = require("child_process").exec;
var async = require('async');
var request = require('request');
var Monitoring = require('@google-cloud/monitoring');
var options = require('./options.json');
var metadata = {};
var intervall;
var apiUri = options.apiUri;

var METRIC_TYPE = options.metricType;
var requestOptions = {
	headers: {
		"Metadata-Flavor":"Google"
	}
};
var client = Monitoring.metric();

console.log("Script is started...");
writeLog().info("Script is started...");

//Start
async.series([
	GetProjectId,
	GetInstanceId,
	GetInstanceZone,
	Send
], function(error, result){

	if(error) {
		writeLog().error(JSON.stringify(error), function(){

			console.log("Error:", error);
			process.exit(2);
		});
	}

	interval = setInterval(Send, 60*1000);

});

/**
 * Get project ID 
 * @function
 */
function GetProjectId(callback) {
	requestOptions.url = apiUri.project + 'project-id';

	request(requestOptions, function(error, response, body) {
		if(error || response && response.statusCode > 200) {
			callback(error || response);
		}
		metadata.projectId = body;
		callback(null, body)
	});

}

/**
 * Get the instance id 
 * @function
 */
function GetInstanceId(callback) {
	requestOptions.url = apiUri.instance + 'id';

	request(requestOptions, function(error, response, body) {
		if(error || response && response.statusCode > 200) {
			callback(error || response);
		}
		metadata.instanceId = body;
		callback(null, body)
	});
}

/**
 * Get the instance zone
 * @function
 **/
function GetInstanceZone(callback) {
	requestOptions.url = apiUri.instance + 'zone';

	request(requestOptions, function (error, response, body) {

		if(error || response && response.statusCode > 200) {
			callback(error || response);
		}

		var splitted = body.split('/')
		metadata.zone = splitted[splitted.length -1];
		callback(null, metadata.zone);
	});
}

/**
 * Send requsto the StackDriver API
 * @function
 * */
function Send(callback){

	var memoryUsed = os.totalmem() - os.freemem();
	var memoryUsedPercent = Math.round(100 * memoryUsed / os.totalmem());

	console.log("Memory used %", memoryUsedPercent);

	var dataPoint = {
		interval: {
			endTime: {
				seconds: Date.now() / 1000
			}
		},
		value: {
			doubleValue: memoryUsedPercent 
		}
	};

	var timeSeriesData = {
		metric: {
			type: METRIC_TYPE,
		},
		resource: {
			type: 'gce_instance',
			labels: {
				zone: metadata.zone,
				instance_id: metadata.instanceId,
				project_id: metadata.projectId
			}
		},
		points: [
			dataPoint
		]
	};

	var request = {
		name: client.projectPath(metadata.projectId),
		timeSeries: [
			timeSeriesData
		]
	};

	// Writes time series data
	client.createTimeSeries(request)
		.then(function(results){
			console.log('Done writing time series data.');
			console.log(results);
			writeLog().success('Usage:'+ memoryUsedPercent, callback);
		})
		.catch(function(err){
			console.error('ERROR:', err);

			if(interval) {
				clearIntervall(interval);
			}

			writeLog().error(JSON.stringify(error), callback);
		});
};

function writeLog(options) {

	options = options || {};
	options.application = options.application || 'APPLICATION';
	options.id = options.id || 1000;
	options.src = 'StackDriver Monitor.js';
	
	function cmd(type, message, callback) {
		var command = "eventcreate /L "+options.application+" /T "+type+" /SO \""+options.src+"\" /D \""+message+"\" /ID "+options.id;
		callback = callback || function(){};
		exec(command, callback);
	}

	return {

		info: function(message, callback) {
			var type = 'INFORMATION'; 
			cmd(type, message, callback);
		},
		warn: function(message, callback) {
			var type = 'WARNING'; 
			cmd(type, message, callback);
		},
		error: function(message, callback) {
			var type = 'ERROR'; 
			cmd(type, message, callback);
		},
		success: function(message, callback) {
			var type = 'SUCCESS';
			cmd(type, message, callback);
		}
	}

}
