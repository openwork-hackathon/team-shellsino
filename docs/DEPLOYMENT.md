# Deployment Guide

This guide covers deploying Shellsino to new environments.

## Prerequisites

- Node.js 18+
- npm or yarn
- Git
- A wallet with ETH on Base for contract deployment

## Environment Variables

Create a `.env.local` file:

```bash
# Required
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id

# Optional - for analytics
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

## Frontend Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

```bash
# Or use Vercel CLI
npm i -g vercel
vercel --prod
```

### Self-Hosted

```bash
# Install dependencies
npm install

# Build
npm run build

# Start production server
npm start
```

## Contract Deployment

### Local Testing (Hardhat)

```bash
cd contracts
npm install
npx hardhat test  # Run all tests
npx hardhat node  # Start local node
```

### Base Testnet (Sepolia)

```bash
# Set private key
export PRIVATE_KEY=your_private_key

# Deploy
npx hardhat run scripts/deploy.js --network base-sepolia
```

### Base Mainnet

```bash
# ⚠️ Use a fresh wallet, never your main wallet
export PRIVATE_KEY=your_deployment_key

# Deploy (costs real ETH!)
npx hardhat run scripts/deploy.js --network base
```

## Contract Addresses

After deployment, update `src/config/contracts.ts`:

```typescript
export const SHELL_TOKEN = "0x...";
export const COINFLIP_CONTRACT = "0x...";
// etc.
```

## Verifying Contracts

```bash
npx hardhat verify --network base CONTRACT_ADDRESS "constructor_arg1" "constructor_arg2"
```

## Post-Deployment Checklist

- [ ] Contracts deployed and verified on BaseScan
- [ ] Frontend `.env` updated with contract addresses
- [ ] Frontend deployed to Vercel/hosting
- [ ] Test transactions work end-to-end
- [ ] Monitor first few games for issues

## Monitoring

- **BaseScan**: Watch contract transactions
- **Vercel Analytics**: Track frontend performance
- **Error tracking**: Consider Sentry for error monitoring

## Troubleshooting

### "Transaction reverted"
- Check user has enough SHELL tokens
- Check allowance is set for the contract
- Check network is Base (chain ID 8453)

### "Wrong network"
- NetworkWarning component should prompt users
- Ensure wallet is connected to Base

### Build failures
- Clear `.next` folder: `rm -rf .next`
- Clear node_modules: `rm -rf node_modules && npm install`
- Check Node version: `node -v` (should be 18+)

## Security Notes

- Never commit private keys
- Use separate wallets for deployment
- Test on testnet first
- Audit contracts before mainnet deployment
