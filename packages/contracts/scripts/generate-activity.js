const { ethers } = require('ethers');
require('dotenv').config();

// Use different RPC to avoid rate limits
const provider = new ethers.JsonRpcProvider('https://base.llamarpc.com');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const SHELL = '0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466';
const COINFLIP_V3 = '0x25B19C2634A2F8338D5a1821F96AF339A5066fbE';

const shellAbi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];

const coinflipAbi = [
  'function enterPool(uint256 betAmount, uint8 choice) external',
  'function matchingPool(uint256 betAmount) view returns (address)'
];

async function main() {
  console.log('Wallet:', wallet.address);
  const shell = new ethers.Contract(SHELL, shellAbi, wallet);
  const coinflip = new ethers.Contract(COINFLIP_V3, coinflipAbi, wallet);
  
  const bet1 = ethers.parseUnits('1', 18);
  
  // Approve max
  console.log('Approving SHELL...');
  const approveTx = await shell.approve(COINFLIP_V3, ethers.MaxUint256);
  console.log('Approve tx:', approveTx.hash);
  await approveTx.wait();
  console.log('Approved!');
  
  // Enter pool
  console.log('Entering 1 SHELL pool (heads)...');
  const tx = await coinflip.enterPool(bet1, 0, { gasLimit: 200000 });
  console.log('Enter tx:', tx.hash);
  await tx.wait();
  console.log('Entered pool! Now waiting for opponent...');
  
  // Check pool state
  const waiting = await coinflip.matchingPool(bet1);
  console.log('Waiting player:', waiting);
}

main().catch(e => console.error(e.message));
