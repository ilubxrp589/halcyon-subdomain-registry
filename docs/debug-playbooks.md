# Debug Playbooks

Step-by-step guides for diagnosing and fixing common failure scenarios. Follow these in order — each step narrows down the cause.

---

## Playbook: Registration Completes But Subdomain Doesn't Resolve

**Symptom:** User pays, NFT mints, but `dig subdomain.tld` returns NXDOMAIN

```
Step 1: Check if record exists in PostgreSQL
  → SELECT * FROM records WHERE name = 'subdomain.tld';
  → If no rows: the INSERT failed after mint. Check backend logs for errors.
  → If rows exist: continue to Step 2.

Step 2: Check domain_id is correct
  → SELECT id FROM domains WHERE name = 'tld';
  → Compare with domain_id in the record. Mismatch = bug in registration code.

Step 3: Check volume-resolver container is running
  → docker ps | grep volume-resolver
  → If not running: docker start volume-resolver
  → Check BIND logs: docker exec volume-resolver tail -20 /var/log/named/default.log

Step 4: Reload BIND zone
  → docker exec volume-resolver rndc reload <tld>
  → Retry dig.

Step 5: Check if querying the right server
  → dig @localhost -p 5300 subdomain.tld A
  → If this works but DoH doesn't: check Caddy/dnsdist chain
  → If neither works: check hsd status (pm2 status halcyon-hsd) and no-sig0 config

Resolution: Fix the broken step, verify end-to-end, save memory snapshot.
```

---

## Playbook: NFT Minted But No Artwork

**Symptom:** NFT exists on-chain but tokenURI points to placeholder or broken IPFS link

```
Step 1: Check art generation queue
  → Is the job in the queue? Check Redis or job table.
  → If not queued: event listener missed the mint event.

Step 2: Check ComfyUI status (4 instances across 2 machines)
  → curl http://192.0.2.97:8188/system_stats   # m3060 GPU0 (RTX 3060)
  → curl http://192.0.2.97:8189/system_stats   # m3060 GPU1 (RTX 3060)
  → curl http://192.0.2.67:8188/system_stats   # mosana1 GPU0 (RTX 3080)
  → curl http://192.0.2.67:8189/system_stats   # mosana1 GPU1 (RTX 3080)
  → If any return error: restart that ComfyUI instance.

Step 3: Check GPU availability
  → nvidia-smi
  → Look for processes consuming VRAM. Kill stuck generations.

Step 4: Check generation logs
  → Did the prompt error? Common: prompt too long, unsupported characters.
  → Did the image generate but upload fail? Check Pinata API response.

Step 5: Check IPFS upload
  → Is the image on Pinata? Check Pinata dashboard or API.
  → If uploaded: the tokenURI update transaction may have failed.
  → If not uploaded: Pinata API key expired or rate limited.

Step 6: Manual recovery
  → Re-queue the art generation job.
  → Once generated and uploaded, call updateTokenURI on the contract.

Resolution: Fix the broken step, verify NFT metadata, save memory snapshot.
```

---

## Playbook: Smart Contract Call Reverts

**Symptom:** Transaction fails with revert, may or may not have a reason string

```
Step 1: Get the revert reason
  → Use ethers.js to simulate the call:
    try { await contract.callStatic.functionName(args) }
    catch (e) { console.log(e.reason) }

Step 2: Common revert reasons
  → "InsufficientFunds" → User didn't send enough FLR
  → "AlreadyRegistered" → Subdomain taken (race condition?)
  → "Unauthorized" → Caller doesn't own the NFT
  → "SessionExpired" → Claim session timed out
  → "Paused" → Contract is paused by admin
  → No reason → Likely a require() without message, or out of gas

Step 3: Check contract state
  → Is the contract paused? Check pause state.
  → Is the session still valid? Check expiry.
  → Does the caller have the right permissions?

Step 4: Check gas
  → Did the transaction run out of gas?
  → Try with higher gas limit (but investigate why it's so high).

Resolution: Fix the root cause, retry the transaction, save memory snapshot.
```

---

## Playbook: Event Listener Stops Receiving Events

**Symptom:** Backend stops processing new registrations, no events in logs

```
Step 1: Check if listener process is running
  → ps aux | grep event-listener (or check pm2/systemd)
  → If dead: restart it, check crash logs.

Step 2: Check WebSocket connection
  → ethers.js WebSocket providers silently disconnect.
  → Check logs for "disconnected" or "error" events.
  → Restart with reconnection logic.

Step 3: Check if events are actually being emitted
  → Look at recent transactions on the explorer.
  → Use contract.queryFilter() to manually fetch missed events.

Step 4: Catch up on missed events
  → Find the last processed block number from your logs/database.
  → queryFilter from that block to current block.
  → Process any missed events.

Step 5: Prevent future misses
  → Implement: store last processed block in database.
  → On restart: catch up from last processed block.
  → Add health check that alerts if no events received in X minutes.

Resolution: Restart listener, process missed events, add monitoring, save snapshot.
```

---

## Playbook: FTSO Price Feed Returns Stale/Zero Data

**Symptom:** Price calculations show $0 or wildly wrong prices

```
Step 1: Check FTSO directly
  → Call the FTSO registry contract for the FLR/USD price.
  → Is the price reasonable? If 0: feed might be down.

Step 2: Check cache
  → Is Redis returning a stale cached price?
  → Clear the cache: redis-cli DEL price:FLR
  → Retry.

Step 3: Check FTSO v2 interface
  → On Coston2: use ContractRegistry.getTestFtsoV2() (all reads free)
  → On mainnet: use ContractRegistry.getFtsoV2() (may require fee via IFeeCalculator)
  → Block-latency feeds update ~1.8s, anchor feeds ~90s
  → Try getFeedByIdInWei() for 18-decimal precision

Step 4: Fallback to CoinGecko
  → curl "https://api.coingecko.com/api/v3/simple/price?ids=flare-networks&vs_currencies=usd"
  → If this works: FTSO issue, use CoinGecko as temporary fallback.

Resolution: Fix price source, verify pricing calculations, save snapshot.
```

---

## Playbook: Database Connection Pool Exhausted

**Symptom:** API returns 500 errors, logs show "too many connections"

```
Step 1: Check active connections
  → SELECT count(*) FROM pg_stat_activity;
  → Compare with max_connections in postgresql.conf

Step 2: Find connection leaks
  → SELECT pid, state, query, query_start FROM pg_stat_activity ORDER BY query_start;
  → Look for idle connections or long-running queries.

Step 3: Kill idle connections
  → SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';

Step 4: Fix the root cause
  → Ensure connection pooling is configured (pg-pool or pgBouncer)
  → Verify connections are released after use (close/release in finally blocks)
  → Set appropriate pool size (typically 10-20 for this scale)

Resolution: Fix pool configuration, kill idle connections, save snapshot.
```

---

## Adding New Playbooks

When you encounter a new failure mode, document it here:
1. **Symptom** — what the user/operator sees
2. **Steps** — ordered diagnostic steps, each narrows the cause
3. **Common causes** — the most frequent root causes
4. **Resolution** — how to fix and prevent recurrence
