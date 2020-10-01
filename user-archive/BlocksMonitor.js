var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
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
    var MS_PER_S = 1000;
    var DEFAULT_STARTUP_TIMEOUT = 600;
    var HEARTBEAT_INTERVAL = 30;
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
                    BlocksMonitor.installationIsUp = true;
                    _this.checkHealth();
                }
            });
        };
        BlocksMonitor.prototype.reportStartupFinished = function () {
            BlocksMonitor.installationIsUp = true;
            BlocksMonitor.installationIsStartingUp = false;
            this.checkHealth();
        };
        BlocksMonitor.prototype.reportShutdown = function () {
            BlocksMonitor.installationIsStartingUp = false;
            BlocksMonitor.installationIsUp = false;
        };
        BlocksMonitor.prototype.registerPJLinkPlusDevice = function (name) {
            var path = 'Network.' + name;
            var device = Network_1.Network[name];
            if (device) {
                if (BlocksMonitor.isDeviceNotMonitored(path)) {
                    BlocksMonitor.addMonitor(new PJLinkPlusMonitor(path, device));
                }
            }
            else {
                console.log('no device found:' + name);
            }
        };
        BlocksMonitor.prototype.registerSpot = function (name) {
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
        BlocksMonitor.isDeviceNotMonitored = function (devicePath) {
            return !BlocksMonitor.monitorsByDevicePath[devicePath];
        };
        BlocksMonitor.addMonitor = function (monitor) {
            BlocksMonitor.monitorsByDevicePath[monitor.path] = monitor;
            BlocksMonitor.monitors.push(monitor);
        };
        BlocksMonitor.prototype.sendHeartbeat = function () {
            var url = BlocksMonitor.settings.blocksMonitorServerURL + '/heartbeat';
            var heartbeat = new HeartbeatMessage();
            heartbeat.installationIsStartingUp = BlocksMonitor.installationIsStartingUp;
            heartbeat.installationIsUp = BlocksMonitor.installationIsUp;
            var json = JSON.stringify(heartbeat);
            this.sendJSON(url, json).then(function (response) {
                if (DEBUG)
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
                        console.log(monitor.path + ' is not connected');
                    }
                    else if (!monitor.isPoweredUp) {
                        console.log(monitor.path + ' is not powered up');
                    }
                    else {
                    }
                }
                resolve();
            });
        };
        BlocksMonitor.reportConnectionChange = function (monitor, connected) {
            if (!connected && BlocksMonitor.installationIsUp) {
                console.log(monitor.path + ' lost connection during installation run (' + connected + ')');
            }
        };
        BlocksMonitor.reportPowerChange = function (monitor, power) {
            if (!power && BlocksMonitor.installationIsUp) {
                console.log(monitor.path + ' lost power during installation run (' + power + ')');
            }
        };
        BlocksMonitor.reportWarning = function (monitor) {
            console.log(monitor.path + ' reported warning');
        };
        BlocksMonitor.reportError = function (monitor) {
            console.log(monitor.path + ' reported error');
        };
        BlocksMonitor.prototype.sendJSON = function (url, jsonContent) {
            if (DEBUG)
                console.log('sendJSON("' + url + '", "' + this.shortenIfNeed(jsonContent, 13) + '")');
            var request = SimpleHTTP_1.SimpleHTTP.newRequest(url);
            request.header('Authorization', 'Bearer ' + BlocksMonitor.settings.accessToken);
            return request.post(jsonContent, 'application/json');
        };
        BlocksMonitor.prototype.shortenIfNeed = function (text, maxLength) {
            var postText = '[...]';
            return text.length <= maxLength ? text : text.substr(0, maxLength - postText.length) + postText;
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
            Metadata_1.callable('register PJLinkPlus device'),
            __param(0, Metadata_1.parameter('device name')),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String]),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "registerPJLinkPlusDevice", null);
        __decorate([
            Metadata_1.callable('register Spot'),
            __param(0, Metadata_1.parameter('spot name')),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", [String]),
            __metadata("design:returntype", void 0)
        ], BlocksMonitor.prototype, "registerSpot", null);
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
    var HeartbeatMessage = (function () {
        function HeartbeatMessage() {
        }
        return HeartbeatMessage;
    }());
    var DeviceMonitor = (function () {
        function DeviceMonitor(path) {
            var _this = this;
            this.path = path;
            var connectedPropName = 'connected';
            var powerPropName = 'power';
            this.connectedAccessor = BlocksMonitor.instance.getProperty(this.path + '.' + connectedPropName, function (connected) {
                BlocksMonitor.reportConnectionChange(_this, connected);
            });
            this.powerAccessor = BlocksMonitor.instance.getProperty(this.path + '.' + powerPropName, function (power) {
                BlocksMonitor.reportPowerChange(_this, power);
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
        return DeviceMonitor;
    }());
    var PJLinkPlusMonitor = (function (_super) {
        __extends(PJLinkPlusMonitor, _super);
        function PJLinkPlusMonitor(path, device) {
            var _this = _super.call(this, path) || this;
            _this.hasProblemAccessor = BlocksMonitor.instance.getProperty(_this.path + '.hasProblem', function (hasProblem) {
                if (device.hasError) {
                    BlocksMonitor.reportError(_this);
                }
                else if (device.hasWarning) {
                    BlocksMonitor.reportWarning(_this);
                }
            });
            return _this;
        }
        return PJLinkPlusMonitor;
    }(DeviceMonitor));
    var SpotMonitor = (function (_super) {
        __extends(SpotMonitor, _super);
        function SpotMonitor(path, device) {
            return _super.call(this, path) || this;
        }
        return SpotMonitor;
    }(DeviceMonitor));
});
