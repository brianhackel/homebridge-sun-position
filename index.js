suncalc = require('suncalc');
const fetchUrl = require("fetch-promise");
var weatherUrl = 'https://api.weather.com/v3/wx/forecast/daily/5day?units=e&language=en-US&format=json';
let UpdatePeriod = 5;

module.exports = function(homebridge) {
    Accessory = homebridge.hap.Accessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-sun-position', 'SunPosition', SunPositionAccessory);
}

function SunPositionAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.triggers = config.triggers;
    this.apiKey = config.apiKey;
    this.cloudThreshold = config.cloudThreshold;

    if (!config.location || !Number.isFinite(config.location.lat) || !Number.isFinite(config.location.lon))
        throw new Error("Missing or invalid location configuration");

    this.location = config.location;
    weatherUrl += "&apiKey=" + this.apiKey + "&geocode=" + this.location.lat + "," + this.location.lon;
    this.updatePeriod = config.updatePeriod || UpdatePeriod;

    this.log("Times for today at configured location:");
    var times = suncalc.getTimes(new Date(), this.location.lat, this.location.lon);
    Object.entries(times).forEach(([key, value]) => {
        this.log(key.padStart(14," ") + " " + value.toLocaleTimeString());
    });
}

SunPositionAccessory.prototype.identify = function(callback) {
    this.log("Identify");
    callback();
}

SunPositionAccessory.prototype.getServices = function() {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "github.com keybuk")
        .setCharacteristic(Characteristic.Model, "Sun Position");

    this.service = new Service.OccupancySensor(this.name);
    this.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(false);
    this.updatePosition();
    return [this.informationService, this.service];
}

SunPositionAccessory.prototype.updatePosition = function() {
    var now = new Date();
    var times = suncalc.getTimes(now, this.location.lat, this.location.lon);

    var position = suncalc.getPosition(now, this.location.lat, this.location.lon);
    var altitude = position.altitude * 180 / Math.PI;
    var azimuth = (position.azimuth * 180 / Math.PI + 180) % 360;

    var current = this.service.getCharacteristic(Characteristic.OccupancyDetected).value;
    
    this.log("Sun is " + altitude.toFixed(2) + " high at " + azimuth.toFixed(2) + " degrees");
    
    if (current) {
        // once there's light "detected," we don't turn off until the offAt time
        if (now > times[this.triggers.offAt]) {
            this.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(false);
        }
    } else {
        if (now < times[this.triggers.offAt]
             && azimuth > this.triggers.minAzimuth 
             && altitude > this.triggers.minAltitude
             && altitude < this.triggers.maxAltitude) {
            fetchUrl(weatherUrl)
             .then(result => {
                var cloudPercentage = JSON.parse(result.buf).daypart[0].cloudCover.find(c => c!== null);
                if (cloudPercentage === undefined || cloudPercentage === null) {
                    cloudPercentage = 0;
                }
                var newValue = true;
                if (cloudPercentage > this.cloudThreshold) {
                    this.log("no sun on floor because wunderground reports cloudy skies (" + cloudPercentage + ")");
                    newValue = false;
                } else {
                    this.log("cloud percentage is: " + cloudPercentage);
                }
                this.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(newValue);
            });
        }
    }
    
    setTimeout(this.updatePosition.bind(this), this.updatePeriod * 60 * 1000);
}

