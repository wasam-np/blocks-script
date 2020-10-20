/*
	Blocks Monitor

 */
const VERSION: string = '0.4.0';

import { PJLinkPlus } from 'driver/PJLinkPlus';
import { Network, NetworkTCP, NetworkUDP } from 'system/Network';
import { SimpleHTTP, Response } from 'system/SimpleHTTP';
import { SimpleFile } from 'system/SimpleFile';
import { Script, ScriptEnv, PropertyAccessor } from 'system_lib/Script';
import { callable, parameter } from 'system_lib/Metadata';
import { DisplaySpot, Spot } from '../system/Spot';
import { NetworkProjector } from '../driver/NetworkProjector';
import { NetworkDriver } from '../system_lib/NetworkDriver';
import { ZummaPC } from '../driver/ZummaPC';

const split: any = require("lib/split-string");

const MS_PER_S = 1000;
const DEFAULT_STARTUP_TIMEOUT = 60 * 10;
const HEARTBEAT_INTERVAL = 60 * 5;
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
				this.reportInstallationIsUp();
			}
		});

		// inform server about startup begin
		this.sendHeartbeat();
	}
	@callable('report installation startup finished - optional (otherwise startup timeout is being used)')
	public reportStartupFinished(): void {
		this.reportInstallationIsUp();
	}

	private reportInstallationIsUp () {
		BlocksMonitor.installationIsUp = true;
		BlocksMonitor.installationIsStartingUp = false;
		this.checkHealth();
		// inform server about startup done
		this.sendHeartbeat();
	}

	@callable('report installation shutdown')
	public reportShutdown(): void {
		BlocksMonitor.installationIsStartingUp = false;
		BlocksMonitor.installationIsUp = false;
		// inform server about shutdown
		this.sendHeartbeat();
	}

	@callable('register Spot')
	public registerSpot(
		@parameter('spot name') name: string
	): void {
		var names = this.getStringArray(name);
		for (let i = 0; i < names.length; i++) {
			this.registerSpotSingle(names[i]);
		}
	}
	private registerSpotSingle(name: string): void {
		var path = 'Spot.' + name;
		var spot = Spot[name] as DisplaySpot;
		if (spot) {
			if (BlocksMonitor.isDeviceNotMonitored(path)) {
				BlocksMonitor.addMonitor(new SpotMonitor(path, spot));
			}
		} else { console.log('no Spot found:' + name); }
	}

	@callable('register Network device')
	public registerNetworkDevice(
		@parameter('device name') name: string
	): void {
		var names = this.getStringArray(name);
		for (let i = 0; i < names.length; i++) {
			this.registerNetworkDeviceSingle(names[i]);
		}
	}
	private registerNetworkDeviceSingle(name: string): void {
		const device = Network[name];
		if (!device) {
			console.log('no device found:' + name);
			return;
		}
		const path = 'Network.' + name;
		if (BlocksMonitor.isDeviceMonitored(path)) return;

		if (device.isOfTypeName(DeviceTypes.PJLinkPlus)) {
			BlocksMonitor.addMonitor(new PJLinkPlusMonitor(path, device as unknown as PJLinkPlus));
		} else if (device.isOfTypeName(DeviceTypes.ZummaPC)) {
			BlocksMonitor.addMonitor(new ZummaPCMonitor(path, device as unknown as ZummaPC));
		} else if (device.isOfTypeName(DeviceTypes.NetworkProjector)) {
			BlocksMonitor.addMonitor(new NetworkProjectorMonitor(path, device as unknown as NetworkProjector));
		} else if (device.isOfTypeName(DeviceTypes.NetworkTCP) ||
			device.isOfTypeName('SamsungMDC') ||
			device.isOfTypeName('ChristiePerformance')) {
			BlocksMonitor.addMonitor(new NetworkTCPDeviceMonitor(path, device as NetworkTCP));
		}
		else if (device.isOfTypeName(DeviceTypes.NetworkUDP)) {
			BlocksMonitor.addMonitor(new NetworkUDPDeviceMonitor(path));
		}
	}

	private static isDeviceMonitored (devicePath: string): boolean {
		return devicePath in BlocksMonitor.monitorsByDevicePath;
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
		var heartbeat : HeartbeatMessage = {
			installationIsStartingUp: BlocksMonitor.installationIsStartingUp,
			installationIsUp: BlocksMonitor.installationIsUp,
			monitorVersion: VERSION,
		};
		var json = JSON.stringify(heartbeat);
		BlocksMonitor.sendJSON(url, json).then((response: Response) => {
			if (DEBUG && response.status != 200) console.log(response.status + ': ' + response.data);
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
					if (DEBUG) console.log(monitor.path + ' is not connected');
				} else if (!monitor.isPoweredUp) {
					if (DEBUG) console.log(monitor.path + ' is not powered up');
				} else {
					// all is fine
				}
				BlocksMonitor.sendDeviceMonitorStatus(monitor);
			}
			resolve();
		});
	}

	private static sendDeviceMonitorStatus(monitor: DeviceMonitor) {
		var statusMessage: IDeviceMonitorStatus = monitor.statusMessage;
		var url = BlocksMonitor.settings.blocksMonitorServerURL + '/device/' + monitor.path;
		var json = JSON.stringify(statusMessage);
		BlocksMonitor.sendJSON(url, json).then((response: Response) => {
			if (DEBUG && response.status != 200) console.log(response.status + ': ' + response.data);
		});
	}

	public static reportConnectionChange(monitor: DeviceMonitor, connected: boolean): void {
		if (!connected && BlocksMonitor.installationIsUp) {
			// connection loss during installation up: might be of interest
			if (DEBUG) console.log(monitor.path + ' lost connection during installation run (' + connected + ')');
		}
		BlocksMonitor.sendDeviceMonitorStatus(monitor);
	}
	public static reportPowerChange(monitor: DeviceMonitor, power: boolean): void {
		if (!power && BlocksMonitor.installationIsUp) {
			// power off during installation up: might be of interest
			if (DEBUG) console.log(monitor.path + ' lost power during installation run (' + power + ')');
		}
		BlocksMonitor.sendDeviceMonitorStatus(monitor);
	}
	public static reportStatusChange(monitor: DeviceMonitor): void {
		BlocksMonitor.sendDeviceMonitorStatus(monitor);
	}
	public static reportWarning(monitor: DeviceMonitor): void {
		if (DEBUG) console.log(monitor.path + ' reported warning');
	}
	public static reportError(monitor: DeviceMonitor): void {
		if (DEBUG) console.log(monitor.path + ' reported error');
	}

	/** SERVER TALK **/

	private static sendJSON(url: string, jsonContent: string): Promise<Response> {
		if (DEBUG) console.log('sendJSON("' + url + '", "' + this.shortenIfNeed(jsonContent, 160) + '")');
		var request = SimpleHTTP.newRequest(url);
		request.header('Authorization', 'Bearer ' + BlocksMonitor.settings.accessToken);
		return request.post(jsonContent, 'application/json');
	}

	private static shortenIfNeed(text: string, maxLength: number): string {
		const postText = '[...]';
		return text.length <= maxLength ? text : text.substr(0, maxLength - postText.length) + postText;
	}

	/* tools */
	private getStringArray(list: string): string[] {
        var result: string[] = [];
        var listParts: string[] = split(list,
            { separator: ',', quotes: ['"', '\''], brackets: { '[': ']' } }
        );
        for (let i = 0; i < listParts.length; i++) {
            var listPart: string = this.removeQuotes(listParts[i].trim());
            result.push(listPart);
        }
        return result;
    }
	private removeQuotes(value: string): string {
        if (value.length < 2) return value;
        const QUOTATION = '"';
        const APOSTROPHE = '\'';
        var first: string = value.charAt(0);
        var last: string = value.charAt(value.length - 1);
        if (
            (first == QUOTATION && last == QUOTATION) ||
            (first == APOSTROPHE && last == APOSTROPHE)
        ) {
            return value.substr(1, value.length - 2);
        }
        return value;
    }

}
enum DeviceTypes {
	Unknown = 'unknown',
	NetworkTCP = 'NetworkTCP',
	NetworkUDP = 'NetworkUDP',
	NetworkDriver = 'NetworkDriver',
	NetworkProjector = 'NetworkProjector',
	PJLinkPlus = 'PJLinkPlus',
	Spot = 'Spot',
	ZummaPC = 'ZummaPC',
}
interface Dictionary<Group> {
	[label: string]: Group;
}
class BlocksMonitorSettings {
	public blocksMonitorServerURL: string = 'http://localhost:3113';
	public accessToken: string = '';
}
interface HeartbeatMessage {
	installationIsStartingUp: boolean;
	installationIsUp: boolean;
	monitorVersion: string;
}
interface IDeviceMonitorStatus {
	isConnected: boolean;
	isPoweredUp: boolean;
	deviceType: string;
	data: IDeviceDataContainer[];
}

// DATA interfaces
interface IDeviceDataContainer {
	deviceType: string;
	deviceData: IDevideData;
}
interface IDevideData {}
interface INetworkDriverData extends IDevideData {
	enabled: boolean;
	address: string;
	port: number;
}
// interface INetworkTCPDeviceData extends IDevideData {}
// interface INetworkProjectorData extends IDevideData {}
interface IPJLinkPlusData extends IDevideData {
	deviceName: string;
	manufactureName: string;
	productName: string;
	otherInformation: string;
	serialNumber: string;
	softwareVersion: string;
}
interface ISpotData extends IDevideData {
	address: string;
	volume: number;
}

class DeviceMonitor {
	public readonly path: string;
	readonly connectedAccessor: PropertyAccessor<boolean>;
	protected powerAccessor: PropertyAccessor<boolean>;
	public constructor(path: string) {
		this.path = path;
		var connectedPropName = 'connected';
		this.connectedAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + connectedPropName, (connected) => {
			BlocksMonitor.reportConnectionChange(this, connected);
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
	public get deviceType(): string { return DeviceTypes.Unknown; }
	public get statusMessage(): IDeviceMonitorStatus {
		var data: IDeviceDataContainer[] = [];
		this.appendDeviceData(data);
		return {
			isConnected: this.isConnected,
			isPoweredUp: this.isPoweredUp,
			deviceType: this.deviceType,
			data: data,
		}
	}
	protected appendDeviceData(_data: IDeviceDataContainer[]) {}
}
class NetworkDeviceMonitor<facadeType> extends DeviceMonitor {}
class NetworkTCPDeviceMonitor extends NetworkDeviceMonitor<NetworkTCP> {
	public constructor(path: string, _device: NetworkTCP) {
		super(path);
	}
	public get deviceType(): string { return DeviceTypes.NetworkTCP; }
}
class NetworkDriverMonitor extends NetworkDeviceMonitor<NetworkTCP | NetworkUDP> {
	readonly networkDriver: NetworkDriver;
	public constructor(path: string, device: NetworkDriver) {
		super(path);
		this.networkDriver = device;
	}
	public get deviceType(): string { return DeviceTypes.NetworkDriver; }
	protected get deviceEnabled(): boolean { return this.networkDriver.enabled; }
	protected get deviceAddress(): string { return this.networkDriver.address; }
	protected get devicePort(): number { return this.networkDriver.port; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: INetworkDriverData = {
			enabled: this.deviceEnabled,
			address: this.deviceAddress,
			port: this.devicePort,
		}
		data.push({ deviceType: DeviceTypes.NetworkDriver, deviceData: deviceData });
	}
}
class NetworkProjectorMonitor extends NetworkDriverMonitor {
	public constructor(path: string, device: NetworkProjector) {
		super(path, device);
		var powerPropName = 'power';
		this.powerAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + powerPropName, (power) => {
			BlocksMonitor.reportPowerChange(this, power);
		});
	}
	public get deviceType(): string { return DeviceTypes.NetworkProjector; }
}
class PJLinkPlusMonitor extends NetworkProjectorMonitor {
	readonly pjLinkPlus: PJLinkPlus;
	readonly hasProblemAccessor: PropertyAccessor<boolean>;
	public constructor(path: string, device: PJLinkPlus) {
		super(path, device);
		this.pjLinkPlus = device;
		const pjLinkPlusDevice: PJLinkPlus = device as unknown as PJLinkPlus;
		this.hasProblemAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.hasProblem', (hasProblem) => {
			if (hasProblem) {
				if (pjLinkPlusDevice.hasError) {
					BlocksMonitor.reportError(this);
				} else if (pjLinkPlusDevice.hasWarning) {
					BlocksMonitor.reportWarning(this);
				}
			}
		});
	}
	public get deviceType(): string { return DeviceTypes.PJLinkPlus; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: IPJLinkPlusData = {
			deviceName: this.pjLinkPlus.deviceName,
			manufactureName: this.pjLinkPlus.manufactureName,
			productName: this.pjLinkPlus.productName,
			otherInformation: this.pjLinkPlus.otherInformation,
			serialNumber: this.pjLinkPlus.serialNumber,
			softwareVersion: this.pjLinkPlus.softwareVersion,
		}
		data.push({ deviceType: DeviceTypes.PJLinkPlus, deviceData: deviceData });
	}
}
class ZummaPCMonitor extends NetworkDriverMonitor {
	public constructor(path: string, device: ZummaPC) {
		super(path, device);
		var powerPropName = 'power';
		this.powerAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + powerPropName, (power) => {
			BlocksMonitor.reportPowerChange(this, power);
		});
	}
	public get deviceType(): string { return DeviceTypes.ZummaPC; }
}
class NetworkUDPDeviceMonitor extends NetworkDeviceMonitor<NetworkUDP> {}
class SpotMonitor extends DeviceMonitor {
	readonly displaySpot: DisplaySpot;
	public constructor(path: string, device: DisplaySpot) {
		super(path);
		this.displaySpot = device;
		var powerPropName = 'power';
		this.powerAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.' + powerPropName, (power) => {
			BlocksMonitor.reportPowerChange(this, power);
		});
	}
	public get deviceType(): string { return DeviceTypes.Spot; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: ISpotData = {
			address: this.displaySpot.address,
			volume: this.displaySpot.volume,
		}
		data.push({ deviceType: DeviceTypes.Spot, deviceData: deviceData });
	}
}
