import Web3 from 'web3';
import { Contract, EventLog } from 'web3/types';
import * as CST from './constants';
import { IEvent } from './types';

const Tx = require('ethereumjs-tx');

export default class ContractUtil {
	public web3: Web3;
	public abi: any;
	public contract: Contract;
	public time: number = 0;
	public lastPrice: number = 400;
	public readonly inceptionBlk: number = 0;
	private readonly custodianAddr: string;
	private readonly duoAddr: string;
	private readonly aContractAddr: string;
	private readonly bContractAddr: string;

	constructor(source: string, provider: string, live: boolean) {
		this.web3 = new Web3(
			source
				? new Web3.providers.HttpProvider(provider)
				: new Web3.providers.WebsocketProvider(provider)
		);
		this.abi = require('./static/Custodian.json');
		this.custodianAddr = live ? CST.CUSTODIAN_ADDR_MAIN : CST.CUSTODIAN_ADDR_KOVAN;
		this.duoAddr = live ? CST.DUO_CONTRACT_ADDR_MAIN : CST.DUO_CONTRACT_ADDR_KOVAN;
		this.aContractAddr = live ? CST.A_CONTRACT_ADDR_MAIN : CST.A_CONTRACT_ADDR_KOVAN;
		this.bContractAddr = live ? CST.B_CONTRACT_ADDR_MAIN : CST.B_CONTRACT_ADDR_KOVAN;
		this.inceptionBlk = live ? CST.INCEPTION_BLK_MAIN : CST.INCEPTION_BLK_KOVAN;
		this.contract = new this.web3.eth.Contract(this.abi.abi, this.custodianAddr);
	}

	public readSysStates() {
		return this.contract.methods.getSystemStates().call();
	}

	public generateTxString(abi: object, input: any[]): string {
		return this.web3.eth.abi.encodeFunctionCall(abi, input);
	}

	public createTxCommand(
		nonce: number,
		gasPrice: number,
		gasLimit: number,
		toAddr: string,
		amount: number,
		data: string
	): object {
		return {
			nonce, // web3.utils.toHex(nonce), //nonce,
			gasPrice: this.web3.utils.toHex(gasPrice),
			gasLimit: this.web3.utils.toHex(gasLimit),
			to: toAddr,
			value: this.web3.utils.toHex(this.web3.utils.toWei(amount.toString(), 'ether')),
			data
		};
	}

	public signTx(rawTx: object, privateKey: string): string {
		try {
			const tx = new Tx(rawTx);
			tx.sign(new Buffer(privateKey, 'hex'));
			return tx.serialize().toString('hex');
		} catch (err) {
			console.log(err);
			return '';
		}
	}

	public getGasPrice() {
		return this.web3.eth.getGasPrice();
	}

	public async commitPrice(
		address: string,
		privateKey: string,
		price: number,
		timestamp: number,
		gasPrice: number,
		gasLimit: number,
		isInception: boolean = false
	) {
		const priceInWei: string = this.web3.utils.toWei(price + '', 'ether');
		const priceInSeconds: string = Math.floor(timestamp / 1000) + '';
		console.log('ETH price is ' + priceInWei + ' at timestamp ' + priceInSeconds);
		const nonce = await this.web3.eth.getTransactionCount(address);
		const abi = {
			name: isInception ? CST.FN_START_CONTRACT : CST.FN_COMMIT_PRICE,
			type: 'function',
			inputs: isInception
				? [
						{
							name: 'priceInWei',
							type: 'uint256'
						},
						{
							name: 'timeInSecond',
							type: 'uint256'
						},
						{
							name: 'aAddr',
							type: 'address'
						},
						{
							name: 'bAddr',
							type: 'address'
						}
				]
				: [
						{
							name: 'priceInWei',
							type: 'uint256'
						},
						{
							name: 'timeInSecond',
							type: 'uint256'
						}
				]
		};
		const command = this.generateTxString(abi, [
			priceInWei,
			priceInSeconds,
			this.web3.utils.toChecksumAddress(this.aContractAddr),
			this.web3.utils.toChecksumAddress(this.bContractAddr)
		]);
		// sending out transaction
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async create(
		address: string,
		privateKey: string,
		gasPrice: number,
		gasLimit: number,
		eth: number,
		nonce: number = -1
	) {
		console.log('the account ' + address + ' is creating tokens with ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'create',
			type: 'function',
			inputs: [
				{
					name: 'payFeeInEth',
					type: 'bool'
				}
			]
		};
		const input = [true];
		const command = this.generateTxString(abi, input);
		// sending out transaction
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' eth ' +
				eth
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							eth,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(err => console.log(err));
	}

	public async redeem(
		address: string,
		privateKey: string,
		amtA: number,
		amtB: number,
		gasPrice: number,
		gasLimit: number,
		nonce: number = -1
	) {
		console.log('the account ' + address + ' privateKey is ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const balanceOfA = await this.contract.methods.balanceOf(0, address).call();
		const balanceOfB = await this.contract.methods.balanceOf(1, address).call();
		console.log('current balanceA: ' + balanceOfA + ' current balanceB: ' + balanceOfB);
		const abi = {
			name: 'redeem',
			type: 'function',
			inputs: [
				{
					name: 'amtInWeiA',
					type: 'uint256'
				},
				{
					name: 'amtInWeiB',
					type: 'uint256'
				},
				{
					name: 'payFeeInEth',
					type: 'bool'
				}
			]
		};
		const input = [amtA, amtB, true];
		const command = this.generateTxString(abi, input);
		// sending out transaction
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' amtA ' +
				amtA +
				' amtB ' +
				amtB
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async transferEth(
		from: string,
		privatekey: string,
		to: string,
		amt: number,
		nonce: number
	) {
		const rawTx = {
			nonce: nonce,
			gasPrice: this.web3.utils.toHex((await this.getGasPrice()) || CST.DEFAULT_GAS_PRICE),
			gasLimit: this.web3.utils.toHex(23000),
			from: from,
			to: to,
			value: this.web3.utils.toHex(this.web3.utils.toWei(amt.toPrecision(3) + '', 'ether'))
		};
		await this.web3.eth
			.sendSignedTransaction('0x' + this.signTx(rawTx, privatekey))
			.then(receipt => console.log(JSON.stringify(receipt, null, 4)));
	}

	public async setValue(
		from: string,
		privatekey: string,
		gasPrice: number,
		gasLimit: number,
		nonce: number,
		index: number,
		newValue: number
	) {
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(from) : nonce;
		const abi = {
			name: 'setValue',
			type: 'function',
			inputs: [
				{
					name: 'idx',
					type: 'uint256'
				},
				{
					name: 'newValue',
					type: 'uint256'
				}
			]
		};
		const input = [index, newValue];
		const command = this.generateTxString(abi, input);
		// sending out transaction
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' index is ' +
				index +
				' newValue is ' +
				newValue
		);
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privatekey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async transferToken(
		index: number,
		address: string,
		privateKey: string,
		to: string,
		value: number,
		gasPrice: number,
		gasLimit: number,
		nonce: number = -1
	) {
		console.log(
			'the account ' +
				address +
				' privateKey is ' +
				privateKey +
				' transfering ' +
				index +
				' to ' +
				to +
				' with amt ' +
				value
		);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'transfer',
			type: 'function',
			inputs: [
				{
					name: 'index',
					type: 'uint256'
				},
				{
					name: 'from',
					type: 'address'
				},
				{
					name: 'to',
					type: 'address'
				},
				{
					name: 'tokens',
					type: 'uint256'
				}
			]
		};
		const input = [index, address, to, value];
		const command = this.generateTxString(abi, input);
		// sending out transaction
		gasPrice = (await this.getGasPrice()) || gasPrice;
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async transferDuoToken(
		address: string,
		privateKey: string,
		to: string,
		value: number,
		gasPrice: number,
		gasLimit: number,
		nonce: number = -1
	): Promise<any> {
		console.log(
			'the account ' +
				address +
				' privateKey is ' +
				privateKey +
				' transfering DUO token to ' +
				to +
				' with amt ' +
				value
		);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'transfer',
			type: 'function',
			inputs: [
				{
					name: 'to',
					type: 'address'
				},
				{
					name: 'value',
					type: 'uint256'
				}
			]
		};
		const input = [to, this.web3.utils.toWei(value + '', 'ether')];
		const command = this.generateTxString(abi, input);
		// sending out transaction
		gasPrice = (await this.getGasPrice()) * 2 || gasPrice;
		// gasPrice = gasPrice || await web3.eth.
		return new Promise((resolve, reject) => {
			return this.web3.eth
				.sendSignedTransaction(
					'0x' +
						this.signTx(
							this.createTxCommand(
								nonce,
								gasPrice,
								gasLimit,
								this.duoAddr,
								0,
								command
							),
							privateKey
						)
				)
				.then(receipt => resolve(receipt))
				.catch(error => reject(error));
		});
	}

	public async collectFee(
		address: string,
		privateKey: string,
		amountInWei: number,
		gasPrice: number,
		gasLimit: number,
		nonce: number = -1
	) {
		console.log('the account ' + address + ' privateKey is ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'collectFee',
			type: 'function',
			inputs: [
				{
					name: 'amountInWei',
					type: 'uint256'
				}
			]
		};
		const input = [amountInWei];
		const command = this.generateTxString(abi, input);
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' amountInWei ' +
				amountInWei
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async addAddress(
		address: string,
		privateKey: string,
		addr1: string,
		addr2: string,
		gasPrice: number,
		gasLimit: number,
		nonce: number
	) {
		console.log('the account ' + address + ' privateKey is ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'addAddress',
			type: 'function',
			inputs: [
				{
					name: 'addr1',
					type: 'address'
				},
				{
					name: 'addr2',
					type: 'address'
				}
			]
		};
		const input = [addr1, addr2];
		const command = this.generateTxString(abi, input);
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' address1 ' +
				addr1 +
				' address2 ' +
				addr2
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async updateAddress(
		address: string,
		privateKey: string,
		current: string,
		gasPrice: number,
		gasLimit: number,
		nonce: number
	) {
		console.log('the account ' + address + ' privateKey is ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'updateAddress',
			type: 'function',
			inputs: [
				{
					name: 'current',
					type: 'address'
				}
			]
		};
		const input = [current];
		const command = this.generateTxString(abi, input);
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' currentAddress ' +
				current
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async removeAddress(
		address: string,
		privateKey: string,
		addr: string,
		gasPrice: number,
		gasLimit: number,
		nonce: number
	) {
		console.log('the account ' + address + ' privateKey is ' + privateKey);
		nonce = nonce === -1 ? await this.web3.eth.getTransactionCount(address) : nonce;
		const abi = {
			name: 'removeAddress',
			type: 'function',
			inputs: [
				{
					name: 'addr',
					type: 'address'
				}
			]
		};
		const input = [addr];
		const command = this.generateTxString(abi, input);
		gasPrice = (await this.getGasPrice()) || gasPrice;
		console.log(
			'gasPrice price ' +
				gasPrice +
				' gasLimit is ' +
				gasLimit +
				' nonce ' +
				nonce +
				' address ' +
				addr
		);
		// gasPrice = gasPrice || await web3.eth.
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async trigger(
		address: string,
		privateKey: string,
		abi: object,
		input: any[],
		gasPrice: number,
		gasLimit: number
	) {
		const nonce = await this.web3.eth.getTransactionCount(address);
		const command = this.generateTxString(abi, input);
		// sending out transaction
		this.web3.eth
			.sendSignedTransaction(
				'0x' +
					this.signTx(
						this.createTxCommand(
							nonce,
							gasPrice,
							gasLimit,
							this.custodianAddr,
							0,
							command
						),
						privateKey
					)
			)
			.then(receipt => console.log(receipt))
			.catch(error => console.log(error));
	}

	public async triggerReset(address: string, privateKey: string, count: number = 1) {
		const abi = {
			name: 'startReset',
			type: 'function',
			inputs: []
		};
		const gasPrice = (await this.getGasPrice()) || CST.DEFAULT_GAS_PRICE;
		console.log('gasPrice price ' + gasPrice + ' gasLimit is ' + CST.RESET_GAS_LIMIT);
		const promiseList: Array<Promise<void>> = [];
		for (let i = 0; i < count; i++)
			promiseList.push(
				this.trigger(address, privateKey, abi, [], gasPrice, CST.RESET_GAS_LIMIT)
			);

		await Promise.all(promiseList);
	}

	public async triggerPreReset(address: string, privateKey: string) {
		const abi = {
			name: 'startPreReset',
			type: 'function',
			inputs: []
		};
		const gasPrice = (await this.getGasPrice()) || CST.DEFAULT_GAS_PRICE;
		console.log('gasPrice price ' + gasPrice + ' gasLimit is ' + CST.PRE_RESET_GAS_LIMIT);
		await this.trigger(address, privateKey, abi, [], gasPrice, CST.PRE_RESET_GAS_LIMIT); // 120000 for lastOne; 30000 for else
	}

	public getCurrentBlock() {
		return this.web3.eth.getBlockNumber();
	}

	public parseEvent(eventLog: EventLog, timestamp: number): IEvent {
		const returnValue = eventLog.returnValues;
		const output: IEvent = {
			type: eventLog.event,
			id: (eventLog as any)['id'],
			blockHash: eventLog.blockHash,
			blockNumber: eventLog.blockNumber,
			transactionHash: eventLog.transactionHash,
			logStatus: (eventLog as any)['type'],
			parameters: {},
			timestamp: timestamp
		};
		for (const key in returnValue) output.parameters[key] = returnValue[key];

		return output;
	}

	public async pullEvents(
		contract: Contract,
		start: number,
		end: number,
		event: string
	): Promise<EventLog[]> {
		return contract.getPastEvents(
			event,
			{
				fromBlock: start,
				toBlock: end
			}
		)
	}
}