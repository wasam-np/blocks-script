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

const PAYLOAD_TYPE_VARIABLE = "VAR";
const PAYLOAD_TYPE_VARIABLE_DESCRIPTION = "VAD";
const PAYLOAD_TYPE_VARIABLE_CONTAINER = "VAC";

const TYPE_BOOLEAN = "boolean";
const TYPE_NUMBER = "number";
const TYPE_STRING = "string";

@driver('NetworkUDP', { port: 12543 })
export class UnityConnection extends Driver<NetworkUDP> {


	public constructor(private socket: NetworkUDP) {
		super(socket);
        console.log('driver loaded');
		socket.subscribe('textReceived', (sender, message) => {
            console.log(message.text);
            if (message.text.substr(0, PAYLOAD_TYPE_VARIABLE_CONTAINER.length) == PAYLOAD_TYPE_VARIABLE_CONTAINER)
            {
                var json = message.text.substr(PAYLOAD_TYPE_VARIABLE_CONTAINER.length);
                var bvc : BlocksVariableContainer = JSON.parse(json);
                this.registerVariable(bvc);
            }

		});
	}

    private registerVariable (bvc: BlocksVariableContainer) {
        switch (bvc.Description.Type)
        {
            case TYPE_BOOLEAN:
            break;
            case TYPE_NUMBER:
            break;
            case TYPE_STRING:
                this.registerStringVariable(bvc.Variable);
            break;
        }
    }
    private registerStringVariable (variable: BlocksVariable) {
        this.property<string>(variable.Name, {type: String}, (sv) => {
            if (sv !== undefined) {
                if (variable.Value !== sv) {
                    variable.Value = sv;
                    console.log(variable.Name, sv);
                    this.sendVariable(variable.Name, variable.Value);
                }
            }
            return variable.Value;
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
    public Min: number;
    public Max: number;
    public WholeNumber: boolean;
}
class BlocksVariableContainer
{
    public Variable: BlocksVariable;
    public Description: BlocksVariableDescription;
}
