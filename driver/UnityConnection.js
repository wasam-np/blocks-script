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
    var PAYLOAD_TYPE_VARIABLE = "VAR";
    var PAYLOAD_TYPE_VARIABLE_DESCRIPTION = "VAD";
    var PAYLOAD_TYPE_VARIABLE_CONTAINER = "VAC";
    var TYPE_BOOLEAN = "boolean";
    var TYPE_NUMBER = "number";
    var TYPE_STRING = "string";
    var UnityConnection = (function (_super) {
        __extends(UnityConnection, _super);
        function UnityConnection(socket) {
            var _this = _super.call(this, socket) || this;
            _this.socket = socket;
            console.log('driver loaded');
            socket.subscribe('textReceived', function (sender, message) {
                console.log(message.text);
                if (message.text.substr(0, PAYLOAD_TYPE_VARIABLE_CONTAINER.length) == PAYLOAD_TYPE_VARIABLE_CONTAINER) {
                    var json = message.text.substr(PAYLOAD_TYPE_VARIABLE_CONTAINER.length);
                    var bvc = JSON.parse(json);
                    _this.registerVariable(bvc);
                }
            });
            return _this;
        }
        UnityConnection.prototype.registerVariable = function (bvc) {
            switch (bvc.Description.Type) {
                case TYPE_BOOLEAN:
                    break;
                case TYPE_NUMBER:
                    break;
                case TYPE_STRING:
                    this.registerStringVariable(bvc.Variable);
                    break;
            }
        };
        UnityConnection.prototype.registerStringVariable = function (variable) {
            var _this = this;
            this.property(variable.Name, { type: String }, function (sv) {
                if (sv !== undefined) {
                    if (variable.Value !== sv) {
                        variable.Value = sv;
                        console.log(variable.Name, sv);
                        _this.sendVariable(variable.Name, variable.Value);
                    }
                }
                return variable.Value;
            });
        };
        UnityConnection.prototype.sendVariable = function (name, value) {
            var variable = {
                Name: name,
                Value: value
            };
            this.socket.sendText(PAYLOAD_TYPE_VARIABLE + JSON.stringify(variable));
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
