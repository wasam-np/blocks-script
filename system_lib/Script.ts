/*
 * Copyright (c) PIXILAB Technologies AB, Sweden (http://pixilab.se). All Rights Reserved.
 * Created 2018 by Mike Fahl.
 */

import {ScriptBase, ScriptBaseEnv} from "system_lib/ScriptBase";

/**
 Ultimate base class for all TypeScript based user scripts.
 */
export class Script extends ScriptBase<ScriptEnv> {


	/**
	 * Connect to the property at the specified full (dot-separated) path. Pass
	 * a callback function to be notified when the value of the property changes.
	 * Returns an object that can be used to read/write the property's value,
	 * as well as close down the connection to the property once no longer
	 * needed.
	 *
	 * The value associated with the property varies with the type of property.
	 */
	getProperty(fullPath: string, changeNotification?: (value: any)=>void): PropertyAccessor {
		return this.__scriptFacade.getProperty(fullPath, changeNotification);
	}

	/**
	 * Establish a named channel associated with this script, with optional "data received
	 * on channel" handler function.
	 */
	establishChannel(leafChannelName: string, callback?: (data: string)=>void) {
		if (callback) {
			this.__scriptFacade.establishChannel(leafChannelName, function (sender:any, axon:any) {
				callback(axon.data);
			});
		} else
			this.__scriptFacade.establishChannel(leafChannelName);
	}

	/**
	 * Send data on my named channel.
	 */
	sendOnChannel(leafChannelName: string, data: string) {
		this.__scriptFacade.sendOnChannel(leafChannelName, data);
	}
}

// Internal implementation - not for direct client access
export interface ScriptEnv extends ScriptBaseEnv {

	establishChannel(name: string):void;
	establishChannel(name: string, listener: Function): void;
	sendOnChannel(name: string, data: string):void;
	getProperty(fullPath: string, changeNotification?: (value: any)=>void): PropertyAccessor;
}

/**
 * What's returned from getProperty. Allows the property's value to be read/written.
 * It may in some cases take some time for a property to become available. Check
 * "available" to be true if you need to know. Once you no longer need
 * this property, call close() to terminate the connection. No further change
 * notification callbacks will be received) after calling close().
 */
export interface PropertyAccessor {
	value: any;		// Current property value (read only if property is read only)
	available: boolean;	// Property has been attached and is now live (read only)
	close(): void;	// Close down this accessor - can no longer be used
}
