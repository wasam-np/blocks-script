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
define(["require", "exports", "system/SimpleHTTP", "system/SimpleFile", "system_lib/Script"], function (require, exports, SimpleHTTP_1, SimpleFile_1, Script_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BlocksMonitor = void 0;
    var BlocksMonitor = (function (_super) {
        __extends(BlocksMonitor, _super);
        function BlocksMonitor(env) {
            var _this = _super.call(this, env) || this;
            _this.accessToken = "";
            var settingsFileName = BlocksMonitor.CONFIG_FILE_NAME;
            SimpleFile_1.SimpleFile.read(settingsFileName).then(function (readValue) {
                var settings = JSON.parse(readValue);
            }).catch(function (error) {
                console.error("Can't read file", settingsFileName, error);
                SimpleFile_1.SimpleFile.write(settingsFileName, JSON.stringify(new BlocksMonitorSettings()));
            });
            return _this;
        }
        BlocksMonitor.prototype.sendJSON = function (jsonContent) {
            var request = SimpleHTTP_1.SimpleHTTP.newRequest(BlocksMonitor.BLOCKS_MONITOR_MSG_URL + this.accessToken);
            return request.post(jsonContent, 'application/json');
        };
        BlocksMonitor.CONFIG_FILE_NAME = "BlocksMonitor.config.json";
        BlocksMonitor.BLOCKS_MONITOR_MSG_URL = "https://api.flock.com/hooks/sendMessage/";
        return BlocksMonitor;
    }(Script_1.Script));
    exports.BlocksMonitor = BlocksMonitor;
    var BlocksMonitorSettings = (function () {
        function BlocksMonitorSettings() {
        }
        return BlocksMonitorSettings;
    }());
});
