/*
	Blocks Monitor

 */
const VERSION: string = '0.6.1';

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
import { WATCHOUT, WATCHOUTCluster } from '../system/WATCHOUT';
import { GrandMA } from '../driver/GrandMA';

const split: any = require("lib/split-string");

const MS_PER_S = 1000;
const DEFAULT_STARTUP_TIMEOUT = 60 * 10;
const HEARTBEAT_INTERVAL = 60 * 5;
const DEBUG = false;
const CONFIG_FILE_NAME = 'BlocksMonitor.config.json';

enum LogLevel {
    Fatal = 50000,
    Error = 40000,
    Warning = 30000,
    Info = 20000,
    Debug = 10000,
}

export class BlocksMonitor extends Script {


	private static monitorsByDevicePath: Dictionary<DeviceMonitor> = {}
	private static monitors: DeviceMonitor[] = [];

	private static installationIsStartingUp: boolean = false;
	private static installationIsUp: boolean = false;

	public static instance: BlocksMonitor;

	private static settings: BlocksMonitorSettings;

    private static logLevel: LogLevel = LogLevel.Info;

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

    @callable('log message')
    public log(
        @parameter('info message') message: string,
        @parameter('log level, defaults to info (info >= ' + LogLevel.Info + ', warning >= ' + LogLevel.Warning + ', error >= ' + LogLevel.Error + ')')
        level?: number,
    ): void {
        BlocksMonitor.sendLogMessage('.', level ? level : LogLevel.Info, message);
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

	@callable('register Network devices. comma separated fx "a, b, c"')
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

		if (device.isOfTypeName(DeviceType.GrandMA)) {
			BlocksMonitor.addMonitor(new GrandMAMonitor(path, device as unknown as GrandMA));
		} else if (device.isOfTypeName(DeviceType.PJLinkPlus)) {
			BlocksMonitor.addMonitor(new PJLinkPlusMonitor(path, device as unknown as PJLinkPlus));
		} else if (device.isOfTypeName(DeviceType.ZummaPC)) {
			BlocksMonitor.addMonitor(new ZummaPCMonitor(path, device as unknown as ZummaPC));
		} else if (device.isOfTypeName(DeviceType.NetworkProjector)) {
			BlocksMonitor.addMonitor(new NetworkProjectorMonitor(path, device as unknown as NetworkProjector));
		} else if (device.isOfTypeName(DeviceType.NetworkTCP) ||
			device.isOfTypeName('ChristiePerformance') ||
			device.isOfTypeName('SamsungMDC')
			) {
			BlocksMonitor.addMonitor(new NetworkTCPDeviceMonitor(path, device as NetworkTCP));
		}
		else if (device.isOfTypeName(DeviceType.NetworkUDP)) {
			BlocksMonitor.addMonitor(new NetworkUDPDeviceMonitor(path));
		}
	}

	@callable('register DisplaySpots. comma separated fx "a, b.b, c"')
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

	@callable('register WATCHOUT clusters. comma separated fx "a, b, e"')
	public registerWatchout(
		@parameter('cluster name') name: string
	): void {
		var names = this.getStringArray(name);
		for (let i = 0; i < names.length; i++) {
			this.registerWatchoutSingle(names[i]);
		}
	}
	private registerWatchoutSingle(name: string): void {
		var path = 'WATCHOUT.' + name;
		var cluster = WATCHOUT[name] as WATCHOUTCluster;
		if (cluster) {
			if (BlocksMonitor.isDeviceNotMonitored(path)) {
				BlocksMonitor.addMonitor(new WATCHOUTClusterMonitor(path, cluster));
			}
		} else { console.log('no Spot found:' + name); }
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
		var heartbeat : IMonitorHeartbeat = {
			installationIsStartingUp: BlocksMonitor.installationIsStartingUp,
			installationIsUp: BlocksMonitor.installationIsUp,
			monitorVersion: VERSION,
			timestamp: new Date(),
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
	// for now just sends all device statuses to the backend
	private checkHealth(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			wait(60 * MS_PER_S).then(() => {
				reject('health check took longer than 60 seconds!');
			});
			for (let i = 0; i < BlocksMonitor.monitors.length; i++) {
				const monitor = BlocksMonitor.monitors[i];
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
    private static sendLogMessage(origin: string, level: LogLevel, message: string): void {
        if (level < this.logLevel) return;
        const url = BlocksMonitor.settings.blocksMonitorServerURL + '/log/' + origin;
        const logMessage: ILogMessage = { message: message, level: level, timestamp: new Date() }
        const json = JSON.stringify(logMessage);
        BlocksMonitor.sendJSON(url, json);
    }

	public static reportConnectionChange(monitor: DeviceMonitor, connected: boolean): void {
		if (!connected && this.installationIsUp) {
			if (DEBUG) console.log(monitor.path + ' lost connection during installation run (' + connected + ')');
		}
		this.sendDeviceMonitorStatus(monitor);
	}
	public static reportPowerChange(monitor: DeviceMonitor, power: boolean): void {
		if (!power && this.installationIsUp) {
			if (DEBUG) console.log(monitor.path + ' lost power during installation run (' + power + ')');
		}
		this.sendDeviceMonitorStatus(monitor);
	}
	public static reportStatusChange(monitor: DeviceMonitor): void { this.sendDeviceMonitorStatus(monitor); }

	public static reportWarning(monitor: DeviceMonitor, text: string): void { this.sendWarningMessage(monitor.path, text); }
	public static reportError(monitor: DeviceMonitor, text: string): void { this.sendErrorMessage(monitor.path, text); }

    public static sendDebugMessage(origin: string, text: string): void { this.sendLogMessage(origin, LogLevel.Debug, text); }
    public static sendInfoMessage(origin: string, text: string): void { this.sendLogMessage(origin, LogLevel.Info, text); }
    public static sendWarningMessage(origin: string, text: string): void { this.sendLogMessage(origin, LogLevel.Warning, text); }
    public static sendErrorMessage(origin: string, text: string): void { this.sendLogMessage(origin, LogLevel.Error, text); }
    public static sendFatalMessage(origin: string, text: string): void { this.sendLogMessage(origin, LogLevel.Fatal, text); }

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
enum DeviceType {
	Unknown = 'unknown',
	NetworkTCP = 'NetworkTCP',
	NetworkUDP = 'NetworkUDP',
	NetworkDriver = 'NetworkDriver',
	NetworkProjector = 'NetworkProjector',
	GrandMA = 'GrandMA',
	PJLinkPlus = 'PJLinkPlus',
	Spot = 'Spot',
	ZummaPC = 'ZummaPC',
	WATCHOUTCluster = 'WATCHOUTCluster',
}
interface Dictionary<Group> {
	[label: string]: Group;
}
class BlocksMonitorSettings {
	public blocksMonitorServerURL: string = 'http://localhost:3113';
	public accessToken: string = '';
}
interface IMessageBase {
  timestamp: Date;
}
interface IMonitorHeartbeat extends IMessageBase {
	installationIsStartingUp: boolean;
	installationIsUp: boolean;
	monitorVersion: string;
}
interface IDeviceMonitorStatus extends IMessageBase {
	isConnected: boolean;
	isPoweredUp: boolean;
	challengeStatus: ChallengeState;
	deviceType: string;
	data: IDeviceDataContainer[];
}
// Challenges
enum ChallengeState {
	NoChallenge = 'no-challenge',
	Warning = 'warning',
	Error = 'error',
	Unknown = 'unknown',
}
// General logging
interface ILogMessage extends IMessageBase {
    level: LogLevel;
    message: string;
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
interface IPJLinkPlusData extends IDevideData {
	deviceName: string;
	manufactureName: string;
	productName: string;
	otherInformation: string;
    errorStatus: string;
	serialNumber: string;
	softwareVersion: string;
    lampCount: number;
    lampActive?: boolean[];
    lampHours?: number[];
    lampReplacementModelNumber?: string;
    hasFilter: boolean;
    filterUsageTime?: number;
    filterReplacementModelNumber?: string;
}
interface ISpotData extends IDevideData {
	address: string;
	volume: number;
}
interface IWATCHOUTClusterData extends IDevideData {
	showName: string;
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
	public get challengeStatus(): ChallengeState { return ChallengeState.NoChallenge; }
	public get deviceType(): string { return DeviceType.Unknown; }
	public get statusMessage(): IDeviceMonitorStatus {
		var data: IDeviceDataContainer[] = [];
		this.appendDeviceData(data);
		return {
			isConnected: this.isConnected,
			isPoweredUp: this.isPoweredUp,
			challengeStatus: this.challengeStatus,
			deviceType: this.deviceType,
			data: data,
			timestamp: new Date(),
		}
	}
	protected appendDeviceData(_data: IDeviceDataContainer[]) {}
}
class NetworkDeviceMonitor<facadeType> extends DeviceMonitor {}
class NetworkTCPDeviceMonitor extends NetworkDeviceMonitor<NetworkTCP> {
	public constructor(path: string, _device: NetworkTCP) {
		super(path);
	}
	public get deviceType(): string { return DeviceType.NetworkTCP; }
}
class NetworkDriverMonitor extends NetworkDeviceMonitor<NetworkTCP | NetworkUDP> {
	readonly networkDriver: NetworkDriver;
	public constructor(path: string, device: NetworkDriver) {
		super(path);
		this.networkDriver = device;
	}
	public get deviceType(): string { return DeviceType.NetworkDriver; }
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
		data.push({ deviceType: DeviceType.NetworkDriver, deviceData: deviceData });
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
	public get deviceType(): string { return DeviceType.NetworkProjector; }
}
class GrandMAMonitor extends NetworkDriverMonitor {
	public get deviceType(): string { return DeviceType.GrandMA; }
}
class PJLinkPlusMonitor extends NetworkProjectorMonitor {
	readonly pjLinkPlus: PJLinkPlus;
	readonly hasProblemAccessor: PropertyAccessor<boolean>;
	public constructor(path: string, device: PJLinkPlus) {
		super(path, device);
		this.pjLinkPlus = device;
		this.hasProblemAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.hasProblem', (hasProblem) => {
			this.handleProblem(hasProblem);
		});
	}
	public get challengeStatus(): ChallengeState {
		if (this.pjLinkPlus.hasError) return ChallengeState.Error;
		if (this.pjLinkPlus.hasWarning) return ChallengeState.Warning;
		return ChallengeState.NoChallenge;
	}
	public get deviceType(): string { return DeviceType.PJLinkPlus; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: IPJLinkPlusData = {
			deviceName: this.pjLinkPlus.deviceName,
			manufactureName: this.pjLinkPlus.manufactureName,
			productName: this.pjLinkPlus.productName,
			otherInformation: this.pjLinkPlus.otherInformation,
            errorStatus: this.pjLinkPlus.errorStatus,
			serialNumber: this.pjLinkPlus.serialNumber,
			softwareVersion: this.pjLinkPlus.softwareVersion,
            lampCount: this.pjLinkPlus.lampCount,
            lampActive: [this.pjLinkPlus.lampOneActive, this.pjLinkPlus.lampTwoActive, this.pjLinkPlus.lampThreeActive, this.pjLinkPlus.lampFourActive],
            lampHours: [this.pjLinkPlus.lampOneHours, this.pjLinkPlus.lampTwoHours, this.pjLinkPlus.lampThreeHours, this.pjLinkPlus.lampFourHours],
            lampReplacementModelNumber: this.pjLinkPlus.lampReplacementModelNumber,
            hasFilter: this.pjLinkPlus.hasFilter,
            filterUsageTime: this.pjLinkPlus.filterUsageTime,
            filterReplacementModelNumber: this.pjLinkPlus.filterReplacementModelNumber,
		}
		data.push({ deviceType: DeviceType.PJLinkPlus, deviceData: deviceData });
	}
	private handleProblem(_hasProblem: boolean): void {
		BlocksMonitor.reportStatusChange(this);
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
	public get deviceType(): string { return DeviceType.ZummaPC; }
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
	public get deviceType(): string { return DeviceType.Spot; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: ISpotData = {
			address: this.displaySpot.address,
			volume: this.displaySpot.volume,
		}
		data.push({ deviceType: DeviceType.Spot, deviceData: deviceData });
	}
}
class WATCHOUTClusterMonitor extends DeviceMonitor {
	readonly cluster: WATCHOUTCluster;
    readonly showNameAccessor: PropertyAccessor<string>;
	public constructor(path: string, cluster: WATCHOUTCluster) {
		super(path);
		this.cluster = cluster;
		cluster.subscribe('error', (_sender, message) => {
			if (message.type == 'Error') BlocksMonitor.reportError(this, message.text);
			else BlocksMonitor.reportWarning(this, message.text);
		});
        this.powerAccessor = BlocksMonitor.instance.getProperty<boolean>(this.path + '.showName', (_showName) => {
			BlocksMonitor.reportStatusChange(this);
		});
	}
	public get deviceType(): string { return DeviceType.WATCHOUTCluster; }
	protected appendDeviceData(data: IDeviceDataContainer[]) {
		super.appendDeviceData(data);
		var deviceData: IWATCHOUTClusterData = {
			showName: this.cluster.showName,
		}
		data.push({ deviceType: DeviceType.WATCHOUTCluster, deviceData: deviceData });
	}
}
