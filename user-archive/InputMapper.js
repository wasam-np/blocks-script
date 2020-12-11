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
define(["require", "exports", "../system_lib/Script", "system_lib/Metadata", "../system/SimpleFile", "../system/IO"], function (require, exports, Script_1, Metadata_1, SimpleFile_1, IO_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InputMapper = void 0;
    var VERSION = '0.1.0';
    var DEBUG = true;
    var CONFIG_FILE_NAME = 'InputMapper.config.json';
    var InputMapper = (function (_super) {
        __extends(InputMapper, _super);
        function InputMapper(env) {
            var _this = _super.call(this, env) || this;
            InputMapper.instance = _this;
            _this.init();
            return _this;
        }
        InputMapper.prototype.reset = function () {
            var _this = this;
            return new Promise(function (resolve) {
                _this.init().then(function () {
                    InputMapper.mappingList.forEach(function (mapping) {
                        var settings = _this.getSettings(mapping.IoAlias);
                        mapping.reset(settings);
                    });
                    resolve();
                });
            });
        };
        InputMapper.prototype.getSettings = function (ioAlias) {
            var settings = null;
            InputMapper.settings.mappingSettings.forEach(function (setting) {
                if (setting.ioAlias == ioAlias) {
                    settings = InputMapperSettings.cloneInputMappingSettings(setting);
                }
            });
            console.log(settings.ioAlias);
            return settings;
        };
        InputMapper.prototype.init = function () {
            var _this = this;
            return new Promise(function (resolve) {
                var settingsFileName = CONFIG_FILE_NAME;
                SimpleFile_1.SimpleFile.read(settingsFileName).then(function (readValue) {
                    InputMapper.settings = JSON.parse(readValue);
                }).catch(function (error) {
                    console.error('Can\'t read file', settingsFileName, error);
                    InputMapper.settings = InputMapperSettings.exampleConfig();
                    SimpleFile_1.SimpleFile.write(settingsFileName, JSON.stringify(InputMapper.settings, null, 4));
                }).finally(function () {
                    _this.setUpMappings();
                    resolve();
                });
            });
        };
        InputMapper.prototype.setUpMappings = function () {
            var _this = this;
            InputMapper.settings.mappingSettings.forEach(function (mappingSetting) {
                var ioAlias = mappingSetting.ioAlias;
                if (!InputMapper.mappings[ioAlias]) {
                    var mapping = new InputMapping(mappingSetting);
                    InputMapper.mappings[ioAlias] = mapping;
                    InputMapper.mappingList.push(mapping);
                    _this.setUpProperties(mappingSetting);
                }
            });
        };
        InputMapper.prototype.setUpProperties = function (mappingSetting) {
            var ioAlias = mappingSetting.ioAlias;
            var valueName = '_' + ioAlias;
            var valueDescription = 'value ' + mappingSetting.outRange.min + '..' + mappingSetting.outRange.max + ' (mapped range)';
            var valueOptions = {
                type: Number,
                description: valueDescription,
                readOnly: true,
            };
            this.property(valueName, valueOptions, function (setValue) {
                return InputMapper.mappings[ioAlias].Value;
            });
            var deltaValueName = '_' + ioAlias + '_delta';
            var deltaValueDescription = 'delta value';
            var deltaValueOptions = {
                type: Number,
                description: deltaValueDescription,
                readOnly: true,
            };
            this.property(deltaValueName, deltaValueOptions, function (setValue) {
                return InputMapper.mappings[ioAlias].DeltaValue;
            });
        };
        InputMapper.prototype.propertyChanged = function (ioAlias) {
            var valueName = '_' + ioAlias;
            var deltaValueName = '_' + ioAlias + '_delta';
            this.__scriptFacade.firePropChanged(valueName);
            this.__scriptFacade.firePropChanged(deltaValueName);
        };
        InputMapper.mappings = {};
        InputMapper.mappingList = [];
        __decorate([
            Metadata_1.callable('reset'),
            __metadata("design:type", Function),
            __metadata("design:paramtypes", []),
            __metadata("design:returntype", Promise)
        ], InputMapper.prototype, "reset", null);
        return InputMapper;
    }(Script_1.Script));
    exports.InputMapper = InputMapper;
    var InputMapperSettings = (function () {
        function InputMapperSettings() {
            this.mappingSettings = [];
        }
        InputMapperSettings.exampleConfig = function () {
            var config = new InputMapperSettings();
            config.mappingSettings.push({
                ioAlias: 'some_input',
                inRange: { min: 0, max: 1 },
                outRange: { min: 0, max: 1 },
                autoInRange: true,
                wholeNumbersOut: false,
                valueLoop: false,
            });
            return config;
        };
        InputMapperSettings.cloneInputMappingSettings = function (settings) {
            return {
                ioAlias: settings.ioAlias,
                inRange: MinMax.clone(settings.inRange),
                outRange: MinMax.clone(settings.outRange),
                autoInRange: settings.autoInRange,
                wholeNumbersOut: settings.wholeNumbersOut,
                valueLoop: settings.valueLoop
            };
        };
        return InputMapperSettings;
    }());
    var MinMax = (function () {
        function MinMax() {
            this.min = 0;
            this.max = 1;
        }
        MinMax.clone = function (minMax) {
            return { min: minMax.min, max: minMax.max };
        };
        return MinMax;
    }());
    var InputMapping = (function () {
        function InputMapping(settings) {
            this.value = 0;
            this.deltaValue = 0;
            this.reset(settings);
        }
        InputMapping.prototype.reset = function (settings) {
            var _a;
            if (DEBUG)
                console.log('InputMapping.reset() for ' + settings.ioAlias);
            this.settings = settings;
            this.rawRange = settings.inRange.max - settings.inRange.min;
            this.scaledRange = settings.outRange.max - settings.outRange.min;
            this.scaledRangeHalf = this.scaledRange / 2;
            this.channel = IO_1.IO[this.settings.ioAlias];
            (_a = this.channel) === null || _a === void 0 ? void 0 : _a.subscribe('change', this.onChannelValueChange.bind(this));
        };
        InputMapping.prototype.onChannelValueChange = function (sender, message) {
            var rawValue = message.value;
            if (isNaN(rawValue))
                return;
            this.handleRawValueChange(rawValue);
        };
        InputMapping.prototype.handleRawValueChange = function (rawValue) {
            if (this.settings.autoInRange) {
                if (rawValue < this.settings.inRange.min)
                    this.settings.inRange.min = rawValue;
                if (rawValue > this.settings.inRange.max)
                    this.settings.inRange.max = rawValue;
                this.rawRange = this.settings.inRange.max - this.settings.inRange.min;
            }
            else {
                if (rawValue < this.settings.inRange.min)
                    rawValue = this.settings.inRange.min;
                if (rawValue > this.settings.inRange.max)
                    rawValue = this.settings.inRange.max;
            }
            var previousValue = this.value;
            this.valueRaw = rawValue;
            this.valueNormalized = (rawValue - this.settings.inRange.min) / this.rawRange;
            var newValue = this.settings.outRange.min + this.valueNormalized * this.scaledRange;
            this.value = this.settings.wholeNumbersOut ? Math.floor(newValue) : newValue;
            if (previousValue != this.value) {
                this.deltaValue = this.value - previousValue;
                while (this.deltaValue > this.scaledRangeHalf) {
                    this.deltaValue -= this.scaledRange;
                }
                while (this.deltaValue < -this.scaledRangeHalf) {
                    this.deltaValue += this.scaledRange;
                }
                InputMapper.instance.propertyChanged(this.settings.ioAlias);
            }
        };
        Object.defineProperty(InputMapping.prototype, "Value", {
            get: function () { return this.value; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(InputMapping.prototype, "DeltaValue", {
            get: function () { return this.deltaValue; },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(InputMapping.prototype, "IoAlias", {
            get: function () { return this.settings.ioAlias; },
            enumerable: false,
            configurable: true
        });
        return InputMapping;
    }());
});
