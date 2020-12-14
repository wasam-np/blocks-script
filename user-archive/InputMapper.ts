/**
 * Input Mapper
 * "mapping inputs since 2020"
 *
 *
 */
 const VERSION: string = '0.1.0';

import { Script, ScriptEnv } from "../system_lib/Script";
import { callable, parameter } from 'system_lib/Metadata';
import { SimpleFile } from "../system/SimpleFile";
import { SGOptions } from "../system/PubSub";
import { IO } from "../system/IO";
import { ModbusChannel } from "../system/Modbus";

const DEBUG = true;
const CONFIG_FILE_NAME = 'InputMapper.config.json';

export class InputMapper extends Script {

	public static instance: InputMapper;
	private static settings: InputMapperSettings;
	private static mappings: Dictionary<InputMapping> = {};
	private static mappingList: InputMapping[] = [];

	public constructor(env: ScriptEnv) {
 		super(env);
		InputMapper.instance = this;
		this.init();
	}

	@callable('reset')
	public reset(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.init().then(() => {
				InputMapper.mappingList.forEach(mapping => {
					var settings = this.getSettings(mapping.IoAlias);
					mapping.reset(settings);
				});
				resolve();
			});
		});
	}

	private getSettings(ioAlias: string): IInputMapping {
		var settings : IInputMapping = null;
		InputMapper.settings.mappingSettings.forEach(setting => {
			if (setting.ioAlias == ioAlias) {
				settings = InputMapperSettings.cloneInputMappingSettings(setting);
			}
		});
		console.log(settings.ioAlias);
		return settings;
	}

	private init(): Promise<void> {
		return new Promise<void>((resolve) => {
			const settingsFileName = CONFIG_FILE_NAME;
			SimpleFile.read(settingsFileName).then(readValue => {
				InputMapper.settings = JSON.parse(readValue);
			}).catch(error => {
				console.error('Can\'t read file', settingsFileName, error);
				InputMapper.settings = InputMapperSettings.exampleConfig();
				SimpleFile.write(settingsFileName, JSON.stringify(InputMapper.settings, null, 4));
			}).finally(() => {
				this.setUpMappings();
				resolve();
			});
		});
	}

	private setUpMappings() {
		InputMapper.settings.mappingSettings.forEach(mappingSetting => {
			const ioAlias = mappingSetting.ioAlias;
			if (!InputMapper.mappings[ioAlias]) {
				const mapping = new InputMapping(mappingSetting);
				InputMapper.mappings[ioAlias] = mapping;
				InputMapper.mappingList.push(mapping);
				this.setUpProperties(mappingSetting);
			}
		});
	}

	private setUpProperties (mappingSetting: IInputMapping) {
		const ioAlias = mappingSetting.ioAlias;
		// VALUE
		const valueName = '_' + ioAlias;
		const valueDescription = 'value ' + mappingSetting.outRange.min + '..' + mappingSetting.outRange.max + ' (mapped range)';
		const valueOptions : SGOptions = {
			type: Number,
			description:  valueDescription,
			readOnly: true,
		};
		this.property<number>(valueName, valueOptions, setValue => {
			return InputMapper.mappings[ioAlias].Value;
		});
		// DELTA VALUE
		const deltaValueName = '_' + ioAlias + '_delta';
		const deltaValueDescription = 'delta value';
		const deltaValueOptions : SGOptions = {
			type: Number,
			description:  deltaValueDescription,
			readOnly: true,
		};
		this.property<number>(deltaValueName, deltaValueOptions, setValue => {
			return InputMapper.mappings[ioAlias].DeltaValue;
		});
	}
	public propertyChanged(ioAlias: string) {
		const valueName = '_' + ioAlias;
		const deltaValueName = '_' + ioAlias + '_delta';
		this.__scriptFacade.firePropChanged(valueName);
		this.__scriptFacade.firePropChanged(deltaValueName);
	}



}


interface Dictionary<Group> {
 	[label: string]: Group;
}
class InputMapperSettings {
	public mappingSettings: IInputMapping[] = [];

	public static exampleConfig() {
		var config = new InputMapperSettings();
		config.mappingSettings.push({
			ioAlias: 'some_input',
			inRange: {min: 0, max: 1},
			outRange: {min: 0, max: 1},
			autoInRange: true,
			wholeNumbersOut: false,
			valueLoop: false,
		});
		return config;
	}
	public static cloneInputMappingSettings(settings: IInputMapping): IInputMapping {
		return {
			ioAlias: settings.ioAlias,
			inRange: MinMax.clone(settings.inRange),
			outRange: MinMax.clone(settings.outRange),
			autoInRange: settings.autoInRange,
			wholeNumbersOut: settings.wholeNumbersOut,
			valueLoop: settings.valueLoop
		}
	}
}
interface IInputMapping {
	ioAlias: string;
	inRange: MinMax;
	outRange: MinMax;
	autoInRange: boolean;
	wholeNumbersOut: boolean;
	valueLoop: boolean;
}
class MinMax {
	min: number = 0;
	max: number = 1;

	public static clone(minMax: MinMax): MinMax {
		return {min: minMax.min, max: minMax.max};
	}
}

class InputMapping {
	private settings: IInputMapping;
	private valueRaw: number;
	private valueNormalized: number;
	private value: number = 0;
	private deltaValue: number = 0;

	private rawRange: number;
	private scaledRange: number;
	private scaledRangeHalf: number;

	private channel: ModbusChannel;

	public constructor(settings: IInputMapping) {
		this.reset(settings);
	}

	public reset(settings: IInputMapping) {
		if (DEBUG) console.log('InputMapping.reset() for ' + settings.ioAlias);
		this.settings = settings;
		this.rawRange = settings.inRange.max - settings.inRange.min;
		this.scaledRange = settings.outRange.max - settings.outRange.min;
		this.scaledRangeHalf = this.scaledRange / 2;

		this.channel = IO[this.settings.ioAlias] as ModbusChannel;
		this.channel?.subscribe('change', this.onChannelValueChange.bind(this));
	}

	private onChannelValueChange(sender: ModbusChannel, message:{value:number|boolean}) {
		const rawValue = message.value as number;
		if (isNaN(rawValue)) return;
		this.handleRawValueChange(rawValue);
	}

	private handleRawValueChange(rawValue: number) {
		if (this.settings.autoInRange) {
			if (rawValue < this.settings.inRange.min) this.settings.inRange.min = rawValue;
			if (rawValue > this.settings.inRange.max) this.settings.inRange.max = rawValue;
			this.rawRange = this.settings.inRange.max - this.settings.inRange.min;
		} else {
			if (rawValue < this.settings.inRange.min) rawValue = this.settings.inRange.min;
			if (rawValue > this.settings.inRange.max) rawValue = this.settings.inRange.max;
		}
		const previousValue = this.value;
		this.valueRaw = rawValue;
		this.valueNormalized = (rawValue - this.settings.inRange.min) / this.rawRange;
		const newValue = this.settings.outRange.min + this.valueNormalized * this.scaledRange;
		this.value = this.settings.wholeNumbersOut ? Math.floor(newValue) : newValue;
		if (previousValue != this.value) {
			this.deltaValue = this.value - previousValue;
			if (this.settings.valueLoop) {
				while (this.deltaValue > this.scaledRangeHalf) this.deltaValue -= this.scaledRange;
				while (this.deltaValue < -this.scaledRangeHalf) this.deltaValue += this.scaledRange;
			}
			InputMapper.instance.propertyChanged(this.settings.ioAlias);
		}
	}

	public get Value(): number { return this.value; }
	public get DeltaValue(): number { return this.deltaValue; }
	public get IoAlias(): string { return this.settings.ioAlias; }
}
