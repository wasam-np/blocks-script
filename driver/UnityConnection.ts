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

const TYPE_BOOLEAN = 'boolean';
const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';

@driver('NetworkUDP', { port: 12543 })
export class UnityConnection extends Driver<NetworkUDP> {

    private typesByName = {};

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
                    var type = this.typesByName[bv.Name];
                    var name = this.renderVariableName(bv.Name);
                    switch (type)
                    {
                        case TYPE_BOOLEAN:
                            this[name] = bv.Value == 'True';
                        break;
                        case TYPE_NUMBER:
                            this[name] = Number(bv.Value);
                        break;
                        case TYPE_STRING:
                            this[name] = bv.Value;
                        break;
                    }

                break;
            }
		});
	}

    private registerVariable (bvc: BlocksVariableContainer) {
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
        this.typesByName[bvc.Variable.Name] = bvc.Description.Type;
    }
    private renderVariableName (name: string) : string {
        return name;
    }
    private registerStringVariable (bvc: BlocksVariableContainer) {
        var name = this.renderVariableName(bvc.Variable.Name);
        var options = {type: String, description: bvc.Description.Description, readOnly: bvc.Description.ReadOnly};
        this.property<string>(name, options, (sv) => {
            if (sv !== undefined) {
                if (bvc.Variable.Value !== sv) {
                    bvc.Variable.Value = sv;
                    // console.log(bvc.Variable.Name, sv);
                    this.sendVariable(bvc.Variable.Name, bvc.Variable.Value);
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
            if (newValue !== undefined) {
                if (value !== newValue) {
                    value = newValue;
                    bvc.Variable.Value = newValue.toString();
                    this.sendVariable(bvc.Variable.Name, bvc.Variable.Value);
                }
            }
            return value;
        });
    }
    private registerBooleanVariable (bvc: BlocksVariableContainer) {
        this.property<boolean>(bvc.Variable.Name, {type: Boolean, description: bvc.Description.Description, readOnly: bvc.Description.ReadOnly}, (sv) => {
            if (sv !== undefined) {
                if (bvc.Variable.Value !== sv.toString()) {
                    bvc.Variable.Value = sv.toString();
                    // console.log(variable.Name, sv);
                    this.sendVariable(bvc.Variable.Name, bvc.Variable.Value);
                }
            }
            return bvc.Variable.Value == "True";
        });
    }

    private sendVariable(name: string, value: string) {
        var variable = {
            Name: name,
            Value: value
        };
        this.socket.sendText(PAYLOAD_TYPE_VARIABLE + JSON.stringify(variable));
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
