suncalc = require('suncalc');

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

    if (!config.location || !Number.isFinite(config.location.lat) || !Number.isFinite(config.location.lon))
        throw new Error("Missing or invalid location configuration");

    this.location = config.location;
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
    this.updatePosition();
    return [this.informationService, this.service];
}

SunPositionAccessory.prototype.updatePosition = function() {
    var now = new Date();
    var times = suncalc.getTimes(now, this.location.lat, this.location.lon);

    var thereIsLight = false;

    var position = suncalc.getPosition(now, this.location.lat, this.location.lon);
    var altitude = position.altitude * 180 / Math.PI;
    var azimuth = (position.azimuth * 180 / Math.PI + 180) % 360;

    var currentlyLight = this.service.getCharacteristic(Characteristic.OccupancyDetected).value;

    if (currentlyLight) {
        // once there's light "detected," we don't turn off until the offAt time
        if (now > times[this.triggers.offAt]) {
        thereIsLight = false;
        }
    } else {
        if (azimuth > this.triggers.minAzimuth 
             && altitude > this.triggers.minAltitude
             && altitude < this.triggers.maxAltitude) {
            thereIsLight = true;
        }
    }

    this.log("Sun is " + altitude.toFixed(2) + " high at " + azimuth.toFixed(2) + " degrees");
    this.service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(thereIsLight);
    setTimeout(this.updatePosition.bind(this), this.updatePeriod * 60 * 1000);
}
