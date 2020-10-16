var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
define(["require", "exports", "system/Network", "system/SimpleHTTP", "system/SimpleFile", "system_lib/Script", "system_lib/Metadata", "../system/Spot"], function (require, exports, Network_1, SimpleHTTP_1, SimpleFile_1, Script_1, Metadata_1, Spot_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BlocksMonitor = void 0;
    var VERSION = '0.4.0';
    var split = require("lib/split-string");
    var MS_PER_S = 1000;
    var DEFAULT_STARTUP_TIMEOUT = 60 * 10;
    var HEARTBEAT_INTERVAL = 60 * 5;
    var DEBUG = true;
    var CONFIG_FILE_NAME = 'BlocksMonitor.config.json';
    var BlocksMonitor = (function (_super) {
        __extends(BlocksMonitor, _super);
        function BlocksMonitor(env) {
            var _this = _super.call(this, env) || this;
            BlocksMonitor.instance = _this;
            var settingsFileName = CONFIG_FILE_NAME;
            SimpleFile_1.SimpleFile.read(settingsFileName).then(function (readValue) {
                BlocksMonitor.settings = JSON.parse(readValue);
            }).catch(function (error) {
                console.error('Can\'t read file', settingsFileName, error);
                BlocksMonitor.settings = new BlocksMonitorSettings();
                SimpleFile_1.SimpleFile.write(settingsFileName, JSON.stringify(BlocksMonitor.settings, null, 4));
            }).finally(function () {
                _this.heartbeatLoop();
            });
            return _this;
        }
        BlocksMonitor.prototype.reportStartup = function (timeout) {
            var _this = this;
            BlocksMonitor.installationIsStartingUp = true;
            wait(timeout * MS_PER_S).then(function () {
                if (BlocksMonitor.installationIsStartingUp) {
                    _this.reportInstallationIsUp();
                }
            });
            this.sendHeartbeat();
        };
        BlocksMonitor.prototype.reportStartupFinished = function () {
            this.reportInstallationIsUp();
        };
        BlocksMonitor.prototype.reportInstallationIsUp = function () {
            BlocksMonitor.installationIsUp = true;
            BlocksMonitor.installationIsStartingUp = false;
            this.checkHealth();
            this.sendHeartbeat();
        };
        BlocksMonitor.prototype.reportShutdown = function () {
            BlocksMonitor.installationIsStartingUp = false;
            BlocksMonitor.installationIsUp = false;
            this.sendHeartbeat();
        };
        BlocksMonitor.prototype.registerSpot = function (name) {
            var names = this.getStringArray(name);
            for (var i = 0; i < names.length; i++) {
                this.registerSpotSingle(names[i]);
            }
        };
        BlocksMonitor.prototype.registerSpotSingle = function (name) {
            var path = 'Spot.' + name;
            var spot = Spot_1.Spot[name];
            if (spot) {
                if (BlocksMonitor.isDeviceNotMonitored(path)) {
                    BlocksMonitor.addMonitor(new SpotMonitor(path, spot));
                }
            }
            else {
                console.log('no Spot found:' + name);
            }
        };
        BlocksMonitor.prototype.registerNetworkDevice = function (name) {
            var names = this.getStringArray(name);
            for (var i = 0; i < names.length; i++) {
                this.registerNetworkDeviceSingle(names[i]);
            }
        };
        BlocksMonitor.prototype.registerNetworkDeviceSingle = function (name) {
            var device = Network_1.Network[name];
            if (!device) {
                console.log('no device found:' + name);
                return;
            }
            var path = 'Network.' + name;
            if (BlocksMonitor.isDeviceMonitored(path))
                return;
            console.log(device.address + ' ' + device.fullName + ' ' + device.name);
            console.log('trying to determine type of ' + path);
            if (device.isOfTypeName('PJLinkPlus')) {
                BlocksMonitor.addMonitor(new PJLinkPlusMonitor(path, device));
            }
            else if (device.isOfTypeName('ZummaPC')) {
                BlocksMonitor.addMonitor(new ZummaPCMonitor(path, device));
            }
            else if (device.isOfTypeName('NetworkProjector')) {
                BlocksMonitor.addMonitor(new NetworkProjectorMonitor(path, device));
            }
            else if (device.isOfTypeName('NetworkTCP') ||
                device.isOfTypeName('SamsungMDC') ||
                device.isOfTypeName('ChristiePerformance')) {
                BlocksMonitor.addMonitor(new NetworkTCPDeviceMonitor(path, device));
            }
            else if (device.isOfTypeName('NetworkUDP')) {
                BlocksMonitor.addMonitor(new NetworkUDPDeviceMonitor(path));
            }
        };
        BlocksMonitor.isDeviceMonitored = function (devicePath) {
            return devicePath in BlocksMonitor.monitorsByDevicePath;
        };
        BlocksMonitor.isDeviceNotMonitored = function (devicePath) {
            return !BlocksMonitor.monitorsByDevicePath[devicePath];
        };
        BlocksMonitor.addMonitor = function (monitor) {
            BlocksMonitor.monitorsByDevicePath[monitor.path] = monitor;
            BlocksMonitor.monitors.push(monitor);
        };
        BlocksMonitor.prototype.sendHeartbeat = function () {
            var url = BlocksMonitor.settings.blocksMonitorServerURL + '/heartbeat';
            var heartbeat = {
                installationIsStartingUp: BlocksMonitor.installationIsStartingUp,
                installationIsUp: BlocksMonitor.installationIsUp,
                monitorVersion: VERSION,
            };
            var json = JSON.stringify(heartbeat);
            BlocksMonitor.sendJSON(url, json).then(function (response) {
                if (DEBUG && response.status != 200)
                    console.log(response.status + ': ' + response.data);
            });
        };
        BlocksMonitor.prototype.heartbeatLoop = function () {
            var _this = this;
            this.sendHeartbeat();
            wait(HEARTBEAT_INTERVAL * MS_PER_S).then(function () {
                _this.heartbeatLoop();
            });
        };
        BlocksMonitor.prototype.checkHealth = function () {
            return new Promise(function (resolve, reject) {
                wait(60 * MS_PER_S).then(function () {
                    reject('health check took longer than 60 seconds!');
                });
                for (var i = 0; i < BlocksMonitor.monitors.length; i++) {
                    var monitor = BlocksMonitor.monitors[i];
                    if (!monitor.isConnected) {
                        if (DEBUG)
                            console.log(monitor.path + ' is not connected');
                    }
                    else if (!monitor.isPoweredUp) {
                        if (DEBUG)
                            console.log(monitor.path + ' is not powered up');
                    }
                    else {
                    }
                    BlocksMonitor.sendDeviceMonitorStatus(monitor);
                }
                resolve();
            });
        };
        BlocksMonitor.sendDeviceMonitorStatus = function (monitor) {
            var statusMessage = monitor.statusMessage;
            var url = BlocksMonitor.settings.blocksMonitorServerURL + '/device/' + monitor.path;
            var json = JSON.stringify(statusMessage);
            BlocksMonitor.sendJSON(url, json).then(function (response) {
                if (DEBUG && response.status != 200)
                    console.log(response.status + ': ' + response.data);
            });
        };
        BlocksMonitor.reportConnectionChange = function (monitor, connected) {
            if (!connected && BlocksMonitor.installationIsUp) {
                if (DEBUG)
                    console.log(monitor.path + ' lost connection during installation run (' + connected + ')');
            }
            BlocksMonitor.sendDeviceMonitorStatus(monitor);
        };
        BlocksMonitor.reportPowerChange = function (monitor, power) {
            if (!power && BlocksMonitor.installationIsUp) {
                if (DEBUG)
                    console.log(monitor.path + ' lost power during installation run (' + power + ')');
            }
            BlocksMonitor.sendDeviceMonitorStatus(monitor);
        };
        BlocksMonitor.reportWarning = function (monitor) {
            if (DEBUG)
                console.log(monitor.path + ' reported warning');
        };
        BlocksMonitor.reportError = function (monitor) {
            if (DEBUG)
                console.log(monitor.path + ' reported error');
        };
        BlocksMonitor.sendJSON = function (url, jsonContent) {
            if (DEBUG)
                console.log('sendJSON("' + url + '", "' + this.shortenIfNeed(jsonContent, 160) + '")');
            var request = SimpleHTTP_1.SimpleHTTP.newRequest(url);
            request.header('Authorization', 'Bearer ' + BlocksMonitor.settings.accessToken);
            return request.post(jsonContent, 'application/json');
        };
        BlocksMonitor.shortenIfNeed = function (text, maxLength) {
            var postText = '[...]';
            return text.length <= maxLength ? text : text.substr(0, maxLength - postText.length) + postText;
        };
        BlocksMonitor.prototype.getStringArray = function (list) {
            var result = [];
            var listParts = split(list, { separator: ',', quotes: ['"', '\''], brackets: { '[': ']' } });
            for (var i = 0; i < listParts.length; i++) {
                var listPart = this.removeQuotes(listParts[i].trim());
                result.push(listPart);
            }
            return result;
        };
        BlocksMonitor.prototype.removeQuotes = function (value) {
            if (value.length < 2)
                return value;
            var QUOTATION = '"';
            var APOSTROPHE = '\'';
            var first = value.charAt(0);
            var last = value.charAt(value.length - 1);
            if ((first == QUOTATION && last == QUOTATION) ||
                (first == APOSTROPHE && last == APOSTROPHE)) {
                return value.substr(1, value.length - 2);
            }
            return value;
        };
        BlocksMonitor.monitorsByDevicePath = {};
        BlocksMonitor.monitors = [];
        BlocksMonitor.installationIsStartingUp = false;
        BlocksMonitor.installationIsUp = false;
        __decorate([
            Metadata_1.callable('report installation startup'),
            __param(0, Metadata_1.parameter('max time in seconds for all registered items to get ready (default ' + DEFAULT_STARTUP_TIMEOUT + ' seconds)', true)),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [Number]),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "reportStartup", null);
        __decorate([
            Metadata_1.callable('report installation startup finished - optional (otherwise startup timeout is being used)'),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", []),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "reportStartupFinished", null);
        __decorate([
            Metadata_1.callable('report installation shutdown'),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", []),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "reportShutdown", null);
        __decorate([
            Metadata_1.callable('register Spot'),
            __param(0, Metadata_1.parameter('spot name')),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String]),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "registerSpot", null);
        __decorate([
            Metadata_1.callable('register Network device'),
            __param(0, Metadata_1.parameter('device name')),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String]),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "registerNetworkDevice", null);
        return BlocksMonitor;
    }(Script_1.Script));
    exports.BlocksMonitor = BlocksMonitor;
    var BlocksMonitorSettings = (function () {
        function BlocksMonitorSettings() {
            this.blocksMonitorServerURL = 'http://localhost:3113';
            this.accessToken = '';
        }
        return BlocksMonitorSettings;
    }());
    var DeviceMonitor = (function () {
        function DeviceMonitor(path) {
            var _this = this;
            this.path = path;
            var connectedPropName = 'connected';
            this.connectedAccessor = BlocksMonitor.instance.getProperty(this.path + '.' + connectedPropName, function (connected) {
                BlocksMonitor.reportConnectionChange(_this, connected);
            });
        }
        Object.defineProperty(DeviceMonitor.prototype, "isConnected", {
            get: function () {
                if (!this.connectedAccessor)
                    return false;
                return this.connectedAccessor.available ? this.connectedAccessor.value : false;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(DeviceMonitor.prototype, "isPoweredUp", {
            get: function () {
                if (!this.powerAccessor)
                    return false;
                return this.powerAccessor.available ? this.powerAccessor.value : false;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(DeviceMonitor.prototype, "deviceType", {
            get: function () { return 'unknown'; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(DeviceMonitor.prototype, "statusData", {
            get: function () { return {}; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(DeviceMonitor.prototype, "statusMessage", {
            get: function () {
                return {
                    isConnected: this.isConnected,
                    isPoweredUp: this.isPoweredUp,
                    deviceType: this.deviceType,
                    data: this.statusData,
                };
            },
            enumerable: false,
            configurable: true
        });
        return DeviceMonitor;
    }());
    var NetworkDeviceMonitor = (function (_super) {
        __extends(NetworkDeviceMonitor, _super);
        function NetworkDeviceMonitor() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return NetworkDeviceMonitor;
    }(DeviceMonitor));
    var NetworkTCPDeviceMonitor = (function (_super) {
        __extends(NetworkTCPDeviceMonitor, _super);
        function NetworkTCPDeviceMonitor(path, device) {
            var _this = _super.call(this, path) || this;
            _this.networkTCPDevice = device;
            console.log(_this.networkTCPDevice.fullName + ' ' + _this.networkTCPDevice.name);
            return _this;
        }
        Object.defineProperty(NetworkTCPDeviceMonitor.prototype, "deviceType", {
            get: function () { return 'NetworkTCP'; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NetworkTCPDeviceMonitor.prototype, "statusData", {
            get: function () {
                return {
                    enabled: this.deviceEnabled,
                    address: this.deviceAddress,
                    port: this.devicePort,
                };
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NetworkTCPDeviceMonitor.prototype, "deviceEnabled", {
            get: function () { return this.networkTCPDevice.enabled; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NetworkTCPDeviceMonitor.prototype, "deviceAddress", {
            get: function () { return this.networkTCPDevice.address; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NetworkTCPDeviceMonitor.prototype, "devicePort", {
            get: function () { return this.networkTCPDevice.port; },
            enumerable: false,
            configurable: true
        });
        return NetworkTCPDeviceMonitor;
    }(NetworkDeviceMonitor));
    var NetworkProjectorMonitor = (function (_super) {
        __extends(NetworkProjectorMonitor, _super);
        function NetworkProjectorMonitor(path, device) {
            var _this = _super.call(this, path, device) || this;
            var powerPropName = 'power';
            _this.powerAccessor = BlocksMonitor.instance.getProperty(_this.path + '.' + powerPropName, function (power) {
                BlocksMonitor.reportPowerChange(_this, power);
            });
            return _this;
        }
        Object.defineProperty(NetworkProjectorMonitor.prototype, "deviceType", {
            get: function () { return 'NetworkProjector'; },
            enumerable: false,
            configurable: true
        });
        return NetworkProjectorMonitor;
    }(NetworkTCPDeviceMonitor));
    var NetworkUDPDeviceMonitor = (function (_super) {
        __extends(NetworkUDPDeviceMonitor, _super);
        function NetworkUDPDeviceMonitor() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return NetworkUDPDeviceMonitor;
    }(NetworkDeviceMonitor));
    var PJLinkPlusMonitor = (function (_super) {
        __extends(PJLinkPlusMonitor, _super);
        function PJLinkPlusMonitor(path, device) {
            var _this = _super.call(this, path, device) || this;
            var pjLinkPlusDevice = device;
            _this.hasProblemAccessor = BlocksMonitor.instance.getProperty(_this.path + '.hasProblem', function (hasProblem) {
                if (hasProblem) {
                    if (pjLinkPlusDevice.hasError) {
                        BlocksMonitor.reportError(_this);
                    }
                    else if (pjLinkPlusDevice.hasWarning) {
                        BlocksMonitor.reportWarning(_this);
                    }
                }
            });
            return _this;
        }
        Object.defineProperty(PJLinkPlusMonitor.prototype, "deviceType", {
            get: function () { return 'PJLinkPlus'; },
            enumerable: false,
            configurable: true
        });
        return PJLinkPlusMonitor;
    }(NetworkProjectorMonitor));
    var ZummaPCMonitor = (function (_super) {
        __extends(ZummaPCMonitor, _super);
        function ZummaPCMonitor(path, device) {
            var _this = _super.call(this, path, device) || this;
            var powerPropName = 'power';
            _this.powerAccessor = BlocksMonitor.instance.getProperty(_this.path + '.' + powerPropName, function (power) {
                BlocksMonitor.reportPowerChange(_this, power);
            });
            return _this;
        }
        Object.defineProperty(ZummaPCMonitor.prototype, "deviceType", {
            get: function () { return 'ZummaPC'; },
            enumerable: false,
            configurable: true
        });
        return ZummaPCMonitor;
    }(NetworkTCPDeviceMonitor));
    var SpotMonitor = (function (_super) {
        __extends(SpotMonitor, _super);
        function SpotMonitor(path, device) {
            var _this = _super.call(this, path) || this;
            var powerPropName = 'power';
            _this.powerAccessor = BlocksMonitor.instance.getProperty(_this.path + '.' + powerPropName, function (power) {
                BlocksMonitor.reportPowerChange(_this, power);
            });
            return _this;
        }
        Object.defineProperty(SpotMonitor.prototype, "deviceType", {
            get: function () { return 'Spot'; },
            enumerable: false,
            configurable: true
        });
        return SpotMonitor;
    }(DeviceMonitor));
});
