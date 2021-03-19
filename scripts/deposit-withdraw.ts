import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from 'ethers'
import { Watcher } from '@eth-optimism/watcher'
import * as dotenv from 'dotenv'
dotenv.config({ path: __dirname + '/../.env' });

import { setupOrRetrieveGateway } from './helpers'

const main = async () => {
  // Grab wallets for both chains
  const l1Provider = new JsonRpcProvider(process.env.L1_WEB3_URL)
  const l2Provider = new JsonRpcProvider(process.env.L2_WEB3_URL)
  const l1Wallet = new Wallet(process.env.USER_PRIVATE_KEY, l1Provider)
  const l2Wallet = new Wallet(process.env.USER_PRIVATE_KEY, l2Provider)

  // other wallet
  const l1Wallet2 = new Wallet(process.env.USER_PRIVATE_KEY2, l1Provider);
  const l2Wallet2 = new Wallet(process.env.USER_PRIVATE_KEY2, l2Provider);
  
  // Grab messenger addresses
  const l1MessengerAddress = process.env.L1_MESSENGER_ADDRESS
  const l2MessengerAddress = '0x4200000000000000000000000000000000000007'

  // Grab existing addresses if specified
  let l1ERC20Address = process.env.L1_ERC20_ADDRESS
  const l1ERC20GatewayAddress = process.env.L1_ERC20_GATEWAY_ADDRESS

  const {
    L1_ERC20,
    OVM_L1ERC20Gateway,
    OVM_L2DepositedERC20
  } = await setupOrRetrieveGateway(
    l1Wallet,
    l2Wallet,
    l1ERC20Address,
    l1ERC20GatewayAddress,
    l1MessengerAddress,
    l2MessengerAddress
  )

  // init watcher
  const watcher = new Watcher({
    l1: {
      provider: l1Provider,
      messengerAddress: l1MessengerAddress
    },
    l2: {
      provider: l2Provider,
      messengerAddress: l2MessengerAddress
    }
  })

  const logBalances = async (description: string = '') => {
    console.log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ' + description + ' ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    if(L1_ERC20) {
      const l1Balance = await L1_ERC20.balanceOf(l1Wallet.address)
      console.log('L1 balance of', l1Wallet.address, 'is', l1Balance.toString())
      const l1Balance2 = await L1_ERC20.balanceOf(l1Wallet2.address)
      console.log('L1 balance of', l1Wallet2.address, 'is', l1Balance2.toString())
      const totalSupply = await L1_ERC20.totalSupply();
      console.log('L1 totalSupply', totalSupply.toString());
    } else { console.log('no L1_ERC20 configured') }
    if(OVM_L2DepositedERC20) {
      const l2Balance = await OVM_L2DepositedERC20.balanceOf(l2Wallet.address)
      console.log('L2 balance of', l2Wallet.address, 'is', l2Balance.toString())
      const l2Balance2 = await OVM_L2DepositedERC20.balanceOf(l2Wallet2.address)
      console.log('L2 balance of', l2Wallet2.address, 'is', l2Balance2.toString())
      const totalSupply = await OVM_L2DepositedERC20.totalSupply();
      console.log('L2 totalSupply', totalSupply.toString());
    } else { console.log('no OVM_L2DepositedERC20 configured') }
    console.log('~'.repeat(description.length) + '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n')
  }

  console.log('\n\nInitial balance')
  await logBalances()

  // Approve
  console.log('Approving L1 deposit contract...')
  const approveTx = await L1_ERC20.approve(OVM_L1ERC20Gateway.address, 10)
  console.log('Approved: https://kovan.etherscan.io/tx/' + approveTx.hash)
  await approveTx.wait()

  // Deposit
  console.log('Depositing into L1 deposit contract...')
  const depositTx = await OVM_L1ERC20Gateway.deposit(10, {gasLimit: 1000000})
  console.log('Deposited: https://kovan.etherscan.io/tx/' + depositTx.hash) 
  await depositTx.wait()

  const [l1ToL2msgHash] = await watcher.getMessageHashesFromL1Tx(depositTx.hash)
	console.log('got L1->L2 message hash', l1ToL2msgHash)
	const l2Receipt = await watcher.getL2TransactionReceipt(l1ToL2msgHash)
  console.log('completed Deposit! L2 tx hash:', l2Receipt.transactionHash)
  
  await logBalances()

  // Withdraw
  console.log('Withdrawing from L1 deposit contract...')
  const withdrawalTx = await OVM_L2DepositedERC20.withdraw(2, {gasLimit: 5000000})
  await withdrawalTx.wait()
  console.log('Withdrawal tx hash:' + withdrawalTx.hash) 

  const [l2ToL1msgHash] = await watcher.getMessageHashesFromL2Tx(withdrawalTx.hash)
  console.log('got L2->L1 message hash', l2ToL1msgHash)
  const l1Receipt = await watcher.getL1TransactionReceipt(l2ToL1msgHash)
  console.log('completed Withdrawal! L1 tx hash:', l1Receipt.transactionHash)
  await logBalances()
}

main()
