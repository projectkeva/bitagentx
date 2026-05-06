import BlueApp from './BlueApp';
import BlueElectrum from './BlueElectrum';
import { HDSegwitP2SHWallet } from './class';
import { createKevaNamespace, updateKeyValue } from './class/keva-ops';
import { FALLBACK_DATA_PER_BYTE_FEE } from './models/networkTransactionFees';

const AGENT_CREATED_KEY = 'Agent Created';
const AGENT_CREATED_TAG = '#satoshicard #newagent';
const AGENT_CREATED_UTXO_RETRIES = 12;
const AGENT_CREATED_UTXO_RETRY_MS = 5000;

async function ensureAppReady() {
  await BlueApp.startAndDecrypt();
  await BlueApp.waitForStart();
  await BlueElectrum.ping();
  await BlueElectrum.waitTillConnected();
}

function resolveNamespaceName(rawName) {
  if (typeof rawName === 'string') {
    const trimmed = rawName.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return 'Agent';
}

function buildNewAgentMonthTag(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `#newagent${year}${month}`;
}

function buildAgentCreatedValue(namespaceId) {
  const civilizationId = String(namespaceId || '').trim();
  const body = `Trillion Agents Civilization ID [ ${civilizationId} ] \n\nThis BitAgent was created by the xKEVA protocol on Kevacoin, a Bitcoin-based blockchain.`;
  return `${body}\n\n${AGENT_CREATED_TAG} ${buildNewAgentMonthTag()}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function refreshNamespaceWalletState(wallet) {
  if (!wallet) {
    return;
  }

  try {
    if (typeof wallet.fetchBalance === 'function') {
      await wallet.fetchBalance();
    }
  } catch (error) {
    console.warn('GetAgentsNamespace: failed to refresh namespace wallet balance', error);
  }

  try {
    if (typeof wallet.fetchTransactions === 'function') {
      await wallet.fetchTransactions();
    }
  } catch (error) {
    console.warn('GetAgentsNamespace: failed to refresh namespace wallet transactions', error);
  }

  try {
    if (typeof wallet.fetchUtxo === 'function') {
      await wallet.fetchUtxo();
    }
  } catch (error) {
    console.warn('GetAgentsNamespace: failed to refresh namespace wallet utxo', error);
  }

  try {
    await BlueApp.saveToDisk();
  } catch (error) {
    console.warn('GetAgentsNamespace: failed to persist namespace wallet after refresh', error);
  }
}

async function writeAgentCreatedKeyValue(wallet, namespaceId) {
  const value = buildAgentCreatedValue(namespaceId);
  let lastError = null;
  for (let attempt = 0; attempt < AGENT_CREATED_UTXO_RETRIES; attempt += 1) {
    try {
      await refreshNamespaceWalletState(wallet);
      const { tx } = await updateKeyValue(
        wallet,
        FALLBACK_DATA_PER_BYTE_FEE,
        namespaceId,
        AGENT_CREATED_KEY,
        value,
      );
      const broadcastResult = await BlueElectrum.broadcast(tx);
      if (broadcastResult && broadcastResult.code) {
        throw new Error(broadcastResult.message || 'Agent Created broadcast failed');
      }
      await refreshNamespaceWalletState(wallet);
      return typeof broadcastResult === 'string' ? broadcastResult : null;
    } catch (error) {
      lastError = error;
      console.warn('GetAgentsNamespace: Agent Created key/value write retry failed', attempt + 1, error);
      if (attempt < AGENT_CREATED_UTXO_RETRIES - 1) {
        await wait(AGENT_CREATED_UTXO_RETRY_MS);
      }
    }
  }
  throw lastError || new Error('Agent Created key/value write failed');
}

export async function handleGetAgentsNamespaceRequest(request, sendMessage) {
  const payload = (request && request.payload) || {};
  const namespaceName = resolveNamespaceName(payload.name);
  const requestId = payload.requestId || null;
  const respond = result => {
    if (typeof sendMessage === 'function') {
      sendMessage({
        type: 'getagents_create_namespace_result',
        payload: {
          requestId,
          ...result,
        },
      });
    }
  };

  try {
    await ensureAppReady();
    const wallets = BlueApp.getWallets();
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error('No wallet available');
    }
    const namespaceWallet = wallets.find(w => w && w.type === HDSegwitP2SHWallet.type);
    if (!namespaceWallet) {
      throw new Error('No compatible wallet found');
    }

    const { tx, namespaceId } = await createKevaNamespace(
      namespaceWallet,
      FALLBACK_DATA_PER_BYTE_FEE,
      namespaceName,
    );
    const broadcastResult = await BlueElectrum.broadcast(tx);
    if (broadcastResult && broadcastResult.code) {
      throw new Error(broadcastResult.message || 'Broadcast failed');
    }

    await refreshNamespaceWalletState(namespaceWallet);
    const txid = typeof broadcastResult === 'string' ? broadcastResult : null;
    const keyValueTxid = await writeAgentCreatedKeyValue(namespaceWallet, namespaceId);
    const result = {
      success: true,
      namespaceId,
      txid,
      keyValueTxid,
    };
    respond(result);
    return result;
  } catch (error) {
    console.warn('GetAgentsNamespace: namespace creation failed', error);
    const result = {
      success: false,
      error: (error && error.message) || String(error),
    };
    respond(result);
    return result;
  }
}
