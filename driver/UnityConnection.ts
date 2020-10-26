/*
	A simple simple connection to an (Unity) application.

    Features:
    - Adjusting settings

 	Copyright (c) 2020 No Parking Production ApS, Denmark (https://noparking.dk). All Rights Reserved.
    Created by: Samuel Walz <mail@samwalz.com>
    Version: 0.1a
 */

import {NetworkUDP} from "system/Network";
import {Driver} from "system_lib/Driver";
import {callable, driver, property} from "system_lib/Metadata";
import { SGOptions } from "../system/PubSub";

const PAYLOAD_TYPE_VARIABLE = 'VAR';
const PAYLOAD_TYPE_VARIABLE_DESCRIPTION = 'VAD';
const PAYLOAD_TYPE_VARIABLE_CONTAINER = 'VAC';
const PAYLOAD_TYPE_VARIABLE_REGISTRY_REQUEST = 'VRR';
const PAYLOAD_TYPE_MESSAGE = 'MSG';

const TYPE_BOOLEAN = 'boolean';
const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';

const BOOLEAN_TRUE = 'True';

@driver('NetworkUDP', { port: 12543 })
export class UnityConnection extends Driver<NetworkUDP> {

    private typesByName: Dictionary<string> = {};
    private variablesByName: Dictionary<BlocksVariable> = {};

    private mMessage: string = '';
    private mMessageClearTimer?: CancelablePromise<void>;

	public constructor(private socket: NetworkUDP) {
		super(socket);

        // ask Unity app for sending all registered variables
        this.sendText(PAYLOAD_TYPE_VARIABLE_REGISTRY_REQUEST);

		socket.subscribe('textReceived', (sender, message) => {
            var text = message.text;
            if (text.length < 3) return;
            var messageType = text.substr(0, 3);
            switch (messageType)
            {
                case PAYLOAD_TYPE_VARIABLE_CONTAINER:
                    var json = message.text.substr(PAYLOAD_TYPE_VARIABLE_CONTAINER.length);
                    var bvc : BlocksVariableContainer = JSON.parse(json);
                    this.registerVariable(bvc);
                break;
                case PAYLOAD_TYPE_VARIABLE:
                    var json = message.text.substr(PAYLOAD_TYPE_VARIABLE.length);
                    var bv : BlocksVariable = JSON.parse(json);
                    this.updateVariable(bv);
                break;
                case PAYLOAD_TYPE_MESSAGE:
                    var msg = message.text.substr(PAYLOAD_TYPE_MESSAGE.length);
                    this.message = msg;
                break;
            }
		});
	}

    // copied from UDP_Input
    @property("The most recent message", true)
	public get message(): string {
		return this.mMessage;
	}
	public set message(cmd: string) {
		this.mMessage = cmd;

		// Cancel and clear out any existing timer
		if (this.mMessageClearTimer) {
			this.mMessageClearTimer.cancel();
			this.mMessageClearTimer = undefined;
		}

		// If this was a non-empty command, set up to clear it after some time
		if (cmd) {
			this.mMessageClearTimer = wait(300);
			this.mMessageClearTimer.then(()=> {
				this.mMessageClearTimer = undefined; // Now taken
				this.message = '';
			});
		}
	}

	/**
	 * Allow clients to check for my type, just as in some system object classes
	 */
	isOfTypeName(typeName: string) {
		return typeName === "UnityConnection" ? this : null;
	}

    private updateVariable (bv: BlocksVariable) {
        var name = this.renderVariableName(bv.Name);
        var type = this.typesByName[name];
        switch (type)
        {
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
    }
    private registerVariable (bvc: BlocksVariableContainer) {
        var name = this.renderVariableName(bvc.Variable.Name);
        var variable = this.variablesByName[name];
        if (variable)
        {
            this.sendVariable(variable);
            return;
        }
        this.typesByName[name] = bvc.Description.Type;
        this.variablesByName[name] = bvc.Variable;
        switch (bvc.Description.Type)
        {
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
    }
    private renderVariableName (name: string) : string {
        return '_' + name;
    }
    private registerStringVariable (bvc: BlocksVariableContainer) {
        var name = this.renderVariableName(bvc.Variable.Name);
        var options = {
            type: String,
            description: bvc.Description.Description,
            readOnly: bvc.Description.ReadOnly
        };
        var value: string = bvc.Variable.Value;
        this.property<string>(name, options, (newValue) => {
            if (newValue !== undefined) {
                if (value !== newValue) {
                    value = newValue;
                    this.variablesByName[name].Value = newValue;
                    this.sendVariable(this.variablesByName[name]);
                }
            }
            return bvc.Variable.Value;
        });
    }
    private registerNumberVariable (bvc: BlocksVariableContainer) {
        var name = this.renderVariableName(bvc.Variable.Name);
        var options : SGOptions = {
            type: Number,
            description: bvc.Description.Description,
            readOnly: bvc.Description.ReadOnly,
            min: bvc.Description.Min,
            max: bvc.Description.Max
        };
        var value : number = Number(bvc.Variable.Value);
        this.property<number>(name, options, (newValue) => {
            if (newValue !== undefined &&
                typeof newValue === 'number' &&
                isFinite(value)) {
                if (value !== newValue) {
                    value = newValue;
                    this.variablesByName[name].Value = newValue.toString();
                    this.sendVariable(this.variablesByName[name]);
                }
            }
            return value;
        });
    }
    private registerBooleanVariable (bvc: BlocksVariableContainer) {
        var name = this.renderVariableName(bvc.Variable.Name);
        var options : SGOptions = {
            type: Boolean,
            description: bvc.Description.Description,
            readOnly: bvc.Description.ReadOnly
        };
        var value: boolean = bvc.Variable.Value == BOOLEAN_TRUE;
        this.property<boolean>(name, options, (newValue) => {
            if (newValue !== undefined) {
                if (value !== newValue) {
                    value = newValue;
                    this.variablesByName[name].Value = newValue ? 'True' : 'False';
                    this.sendVariable(this.variablesByName[name]);
                }
            }
            return value;
        });
    }

    private sendVariable(bv: BlocksVariable) {
        this.socket.sendText(PAYLOAD_TYPE_VARIABLE + JSON.stringify(bv));
    }
	private sendText(toSend: string) {
		this.socket.sendText(toSend);
	}


}

class BlocksVariable {
    public Name: string;
    public Value: string;
}
class BlocksVariableDescription {
    public Type: string;
    public Description: string;
    public Min: number;
    public Max: number;
    public ReadOnly: boolean;
    public WholeNumber: boolean;
}
class BlocksVariableContainer
{
    public Variable: BlocksVariable;
    public Description: BlocksVariableDescription;
}
interface Dictionary<Group> {
    [id: string]: Group;
}
