/*
	Blocks Monitor


 */
import { PJLinkPlus } from 'driver/PJLinkPlus';
import { Network, NetworkTCP } from 'system/Network';
import { SimpleHTTP, Response } from 'system/SimpleHTTP';
import { SimpleFile } from 'system/SimpleFile';
import { Script, ScriptEnv, PropertyAccessor } from 'system_lib/Script';
import { callable, parameter, property } from 'system_lib/Metadata';
import { DisplaySpot, Spot } from '../system/Spot';

const MS_PER_S = 1000;
const DEFAULT_STARTUP_TIMEOUT = 600;
const HEARTBEAT_INTERVAL = 30;
const DEBUG = true;
const CONFIG_FILE_NAME = 'BlocksMonitor.config.json';

export class BlocksMonitor extends Script {


	private static monitorsByDevicePath: Dictionary<DeviceMonitor> = {}
	private static monitors: DeviceMonitor[] = [];

	private static installationIsStartingUp: boolean = false;
	private static installationIsUp: boolean = false;

	public static instance: BlocksMonitor;

	private static settings: BlocksMonitorSettings;

	public constructor(env: ScriptEnv) {
		super(env);
		BlocksMonitor.instance = this;

		const settingsFileName = CONFIG_FILE_NAME;
		SimpleFile.read(settingsFileName).then(readValue => {
			BlocksMonitor.settings = JSON.parse(readValue);
		}).catch(error => {
			console.error('Can\'t read file', settingsFileName, error);
			BlocksMonitor.settings = new BlocksMonitorSettings();
			SimpleFile.write(settingsFileName, JSON.stringify(BlocksMonitor.settings, null, 4));
		}).finally(() => {
			this.heartbeatLoop();
		});
	}

	@callable('report installation startup')
	public reportStartup(
		@parameter('max time in seconds for all registered items to get ready (default ' + DEFAULT_STARTUP_TIMEOUT + ' seconds)', true)
		timeout?: number
	): void {
		BlocksMonitor.installationIsStartingUp = true;
		wait(timeout * MS_PER_S).then(() => {
			if (BlocksMonitor.installationIsStartingUp) {
				BlocksMonitor.installationIsUp = true;
				this.checkHealth();
			}
		});
	}
	@callable('report installation startup finished - optional (otherwise startup timeout is being used)')
	public reportStartupFinished(): void {
		BlocksMonitor.installationIsUp = true;
		BlocksMonitor.installationIsStartingUp = false;
		this.checkHealth();
	}
	@callable('report installation shutdown')
	public reportShutdown(): void {
		BlocksMonitor.installationIsStartingUp = false;
		BlocksMonitor.installationIsUp = false;
	}

	@callable('register PJLinkPlus device')
	public registerPJLinkPlusDevice(
		@parameter('device name')
		name: string
	): void {
		var path = 'Network.' + name;
		var device = Network[name] as unknown as PJLinkPlus;
		if (device) {
			if (BlocksMonitor.isDeviceNotMonitored(path)) {
				BlocksMonitor.addMonitor(new PJLinkPlusMonitor(path, device));
			}
		} else {
			console.log('no device found:' + name);
		}
	}
	@callable('register Spot')
	public registerSpot(
		@parameter('spot name')
		name: string
	): void {
		var path = 'Spot.' + name;
		var spot = Spot[name] as DisplaySpot;
		if (spot) {
			if (BlocksMonitor.isDeviceNotMonitored(path)) {
				BlocksMonitor.addMonitor(new SpotMonitor(path, spot));
			}
		} else {
			console.log('no Spot found:' + name);
		}
	}

	private static isDeviceNotMonitored (devicePath: string): boolean {
		return !BlocksMonitor.monitorsByDevicePath[devicePath];
	}
	private static addMonitor(monitor: DeviceMonitor): void {
		BlocksMonitor.monitorsByDevicePath[monitor.path] = monitor;
		BlocksMonitor.monitors.push(monitor);
	}

	/** HEARTBEAT **/
	private sendHeartbeat() {
		var url = BlocksMonitor.settings.blocksMonitorServerURL + '/heartbeat';
		var heartbeat : HeartbeatMessage = new HeartbeatMessage();
		heartbeat.installationIsStartingUp = BlocksMonitor.installationIsStartingUp;
		heartbeat.installationIsUp = BlocksMonitor.installationIsUp;
		var json = JSON.stringify(heartbeat);
		this.sendJSON(url, json).then((response: Response) => {
			if (DEBUG) console.log(response.status + ': ' + response.data);
		});
	}
	private heartbeatLoop () {
		this.sendHeartbeat();
		wait(HEARTBEAT_INTERVAL * MS_PER_S).then(() => {
			this.heartbeatLoop();
		});
	}

	/** HEALTH CHECK **/

	private checkHealth(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			wait(60 * MS_PER_S).then(() => {
				reject('health check took longer than 60 seconds!');
			});
			for (let i = 0; i < BlocksMonitor.monitors.length; i++) {
				const monitor = BlocksMonitor.monitors[i];
				if (!monitor.isConnected) {
					console.log(monitor.path + ' is not connected');
				} else if (!monitor.isPoweredUp) {
					console.log(monitor.path + ' is not powered up');
				} else {
					// all is fine
				}
			}
			resolve();
		});
	}


	public static reportConnectionChange(monitor: DeviceMonitor, connected: boolean): void {
		if (!connected && BlocksMonitor.installationIsUp) {
			// connection loss during installation up: might be of interest
			console.log(monitor.path + ' lost connection during installation run (' + connected + ')');
		}
	}
	public static reportPowerChange(monitor: DeviceMonitor, power: boolean): void {
		if (!power && BlocksMonitor.installationIsUp) {
			// power off during installation up: might be of interest
			console.log(monitor.path + ' lost power during installation run (' + power + ')');
		}
	}
	public static reportWarning(monitor: DeviceMonitor): void {
		console.log(monitor.path + ' reported warning');
	}
	public static reportError(monitor: DeviceMonitor): void {
		console.log(monitor.path + ' reported error');
	}

	/** SERVER TALK **/

	private sendJSON(url: string, jsonContent: string): Promise<Response> {
		if (DEBUG) console.log('sendJSON("' + url + '", "' + this.shortenIfNeed(jsonContent, 13) + '")');
		var request = SimpleHTTP.newRequest(url);
		request.header('Authorization', 'Bearer ' + BlocksMonitor.settings.accessToken);
		return request.post(jsonContent, 'application/json');
	}

	private shortenIfNeed(text: string, maxLength: number): string {
		const postText = '[...]';
		return text.length <= maxLength ? text : text.substr(0, maxLength - postText.length) + postText;
	}

}
interface Dictionary<Group> {
	[label: string]: Group;
}
class BlocksMonitorSettings {
	public blocksMonitorServerURL: string = 'http://localhost:3113';
	public accessToken: string = '';
}
class HeartbeatMessage {
	public installationIsStartingUp: boolean;
	public installationIsUp: boolean;
}

class DeviceMonitor {
	public readonly path: string;
	readonly connectedAccessor: PropertyAccessor<boolean>;
	readonly powerAccessor: PropertyAccessor<boolean>;
	public constructor(path: string) {
		this.path = path;
		var connectedPropName = 'connected';
		var powerPropName = 'power';
		this.connectedAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + connectedPropName, (connected) => {
			BlocksMonitor.reportConnectionChange(this, connected);
			// console.log(this.path + ' connected: ' + connected);
		});
		this.powerAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + powerPropName, (power) => {
			BlocksMonitor.reportPowerChange(this, power);
			// console.log(this.path + ' power: ' + power);
		});
	}
	public get isConnected(): boolean {
		if (!this.connectedAccessor) return false;
		return this.connectedAccessor.available ? this.connectedAccessor.value : false;
	}
	public get isPoweredUp(): boolean {
		if (!this.powerAccessor) return false;
		return this.powerAccessor.available ? this.powerAccessor.value : false;
	}
}
class PJLinkPlusMonitor extends DeviceMonitor {
	readonly hasProblemAccessor: PropertyAccessor<boolean>;

	public constructor(path: string, device: PJLinkPlus) {
		super(path);

		this.hasProblemAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.hasProblem', (hasProblem) => {
			if (device.hasError) {
				BlocksMonitor.reportError(this);
			} else if (device.hasWarning) {
				BlocksMonitor.reportWarning(this);
			}
			// console.log(this.path + ' has problem: ' + hasProblem);
		});
	}
}
class SpotMonitor extends DeviceMonitor {
	public constructor(path: string, device: DisplaySpot) {
		super(path);
	}
}
