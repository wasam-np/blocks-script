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
define(["require", "exports", "system_lib/Driver", "system_lib/Metadata"], function (require, exports, Driver_1, Metadata_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.UnityConnection = void 0;
    var PAYLOAD_TYPE_VARIABLE = 'VAR';
    var PAYLOAD_TYPE_VARIABLE_DESCRIPTION = 'VAD';
    var PAYLOAD_TYPE_VARIABLE_CONTAINER = 'VAC';
    var PAYLOAD_TYPE_VARIABLE_REGISTRY_REQUEST = 'VRR';
    var TYPE_BOOLEAN = 'boolean';
    var TYPE_NUMBER = 'number';
    var TYPE_STRING = 'string';
    var BOOLEAN_TRUE = 'True';
    var UnityConnection = (function (_super) {
        __extends(UnityConnection, _super);
        function UnityConnection(socket) {
            var _this = _super.call(this, socket) || this;
            _this.socket = socket;
            _this.typesByName = {};
            _this.variablesByName = {};
            _this.sendText(PAYLOAD_TYPE_VARIABLE_REGISTRY_REQUEST);
            socket.subscribe('textReceived', function (sender, message) {
                var text = message.text;
                if (text.length < 3)
                    return;
                var messageType = text.substr(0, 3);
                switch (messageType) {
                    case PAYLOAD_TYPE_VARIABLE_CONTAINER:
                        var json = message.text.substr(PAYLOAD_TYPE_VARIABLE_CONTAINER.length);
                        var bvc = JSON.parse(json);
                        _this.registerVariable(bvc);
                        break;
                    case PAYLOAD_TYPE_VARIABLE:
                        var json = message.text.substr(PAYLOAD_TYPE_VARIABLE.length);
                        var bv = JSON.parse(json);
                        _this.updateVariable(bv);
                        break;
                }
            });
            return _this;
        }
        UnityConnection.prototype.updateVariable = function (bv) {
            var name = this.renderVariableName(bv.Name);
            var type = this.typesByName[name];
            switch (type) {
                case TYPE_BOOLEAN:
                    this[name] = bv.Value == BOOLEAN_TRUE;
                    break;
                case TYPE_NUMBER:
                    this[name] = Number(bv.Value);
                    break;
                case TYPE_STRING:
                    this[name] = bv.Value;
                    break;
            }
        };
        UnityConnection.prototype.registerVariable = function (bvc) {
            var name = this.renderVariableName(bvc.Variable.Name);
            var variable = this.variablesByName[name];
            if (variable) {
                this.sendVariable(variable);
                return;
            }
            this.typesByName[name] = bvc.Description.Type;
            this.variablesByName[name] = bvc.Variable;
            switch (bvc.Description.Type) {
                case TYPE_BOOLEAN:
                    this.registerBooleanVariable(bvc);
                    break;
                case TYPE_NUMBER:
                    this.registerNumberVariable(bvc);
                    break;
                case TYPE_STRING:
                    this.registerStringVariable(bvc);
                    break;
            }
        };
        UnityConnection.prototype.renderVariableName = function (name) {
            return '_' + name;
        };
        UnityConnection.prototype.registerStringVariable = function (bvc) {
            var _this = this;
            var name = this.renderVariableName(bvc.Variable.Name);
            var options = {
                type: String,
                description: bvc.Description.Description,
                readOnly: bvc.Description.ReadOnly
            };
            var value = bvc.Variable.Value;
            this.property(name, options, function (newValue) {
                if (newValue !== undefined) {
                    if (value !== newValue) {
                        value = newValue;
                        _this.variablesByName[name].Value = newValue;
                        _this.sendVariable(_this.variablesByName[name]);
                    }
                }
                return bvc.Variable.Value;
            });
        };
        UnityConnection.prototype.registerNumberVariable = function (bvc) {
            var _this = this;
            var name = this.renderVariableName(bvc.Variable.Name);
            var options = {
                type: Number,
                description: bvc.Description.Description,
                readOnly: bvc.Description.ReadOnly,
                min: bvc.Description.Min,
                max: bvc.Description.Max
            };
            var value = Number(bvc.Variable.Value);
            this.property(name, options, function (newValue) {
                if (newValue !== undefined &&
                    typeof newValue === 'number' &&
                    isFinite(value)) {
                    if (value !== newValue) {
                        value = newValue;
                        _this.variablesByName[name].Value = newValue.toString();
                        _this.sendVariable(_this.variablesByName[name]);
                    }
                }
                return value;
            });
        };
        UnityConnection.prototype.registerBooleanVariable = function (bvc) {
            var _this = this;
            var name = this.renderVariableName(bvc.Variable.Name);
            var options = {
                type: Boolean,
                description: bvc.Description.Description,
                readOnly: bvc.Description.ReadOnly
            };
            var value = bvc.Variable.Value == BOOLEAN_TRUE;
            this.property(name, options, function (newValue) {
                if (newValue !== undefined) {
                    if (value !== newValue) {
                        value = newValue;
                        _this.variablesByName[name].Value = newValue ? 'True' : 'False';
                        _this.sendVariable(_this.variablesByName[name]);
                    }
                }
                return value;
            });
        };
        UnityConnection.prototype.sendVariable = function (bv) {
            this.socket.sendText(PAYLOAD_TYPE_VARIABLE + JSON.stringify(bv));
        };
        UnityConnection.prototype.sendText = function (toSend) {
            this.socket.sendText(toSend);
        };
        UnityConnection = __decorate([
            Metadata_1.driver('NetworkUDP', { port: 12543 }),
            __metadata("design:paramtypes", [Object])
        ], UnityConnection);
        return UnityConnection;
    }(Driver_1.Driver));
    exports.UnityConnection = UnityConnection;
    var BlocksVariable = (function () {
        function BlocksVariable() {
        }
        return BlocksVariable;
    }());
    var BlocksVariableDescription = (function () {
        function BlocksVariableDescription() {
        }
        return BlocksVariableDescription;
    }());
    var BlocksVariableContainer = (function () {
        function BlocksVariableContainer() {
        }
        return BlocksVariableContainer;
    }());
});
