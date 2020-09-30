/*
	Blocks Monitor


 */
import {SimpleHTTP} from "system/SimpleHTTP";
import {SimpleFile} from "system/SimpleFile";
import {Script, ScriptEnv} from "system_lib/Script";
import {callable, parameter} from "system_lib/Metadata";

export class BlocksMonitor extends Script {

    private static CONFIG_FILE_NAME = "BlocksMonitor.config.json";
    private static BLOCKS_MONITOR_MSG_URL = "https://api.flock.com/hooks/sendMessage/";

    private accessToken = "";

	public constructor(env : ScriptEnv) {
		super(env);

        const settingsFileName = BlocksMonitor.CONFIG_FILE_NAME;
        SimpleFile.read(settingsFileName).then(readValue => {
            var settings : BlocksMonitorSettings = JSON.parse(readValue);
			// this.accessToken = settings.access_token;
			// if (!this.accessToken)
			// 	console.warn("Access token not set", settingsFileName)
		}).catch(error => {
            console.error("Can't read file", settingsFileName, error);
            SimpleFile.write(settingsFileName, JSON.stringify(new BlocksMonitorSettings()));
        });
	}




    private sendJSON (jsonContent : string) : Promise<any>
    {
        var request = SimpleHTTP.newRequest(BlocksMonitor.BLOCKS_MONITOR_MSG_URL + this.accessToken);
        return request.post(jsonContent, 'application/json');
    }

}

class BlocksMonitorSettings {

}
