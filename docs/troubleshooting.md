# Troubleshooting Guide

## Known Issues & Quirks

This doc captures problems that have been encountered. Update this whenever a new issue is found and resolved — future sessions shouldn't have to rediscover the same fix.

---

### GPU / ComfyUI Issues

**CUDA Out of Memory on 1024x1024 with Flux.1**
- RTX 3060 12GB can't handle Flux.1 Dev at full resolution
- Fix: Use 768x768 as fallback for Flux models, or use W4A8 quantization
- SDXL and Juggernaut XL handle 1024x1024 fine on 12GB

**ComfyUI instance won't start**
- Render stations: m3060 (10.0.0.97, 2x RTX 3060) and mosana1 (10.0.0.67, 2x RTX 3080)
- Check if another process is holding the port: `lsof -i :8188`
- Check GPU is visible: `nvidia-smi`
- Check CUDA version matches PyTorch: `python -c "import torch; print(torch.cuda.is_available())"`
- Restart: `kill $(lsof -t -i:8188) && cd /path/to/comfyui && python main.py --port 8188 --cuda-device 0`

**GPU driver issues**
- If `nvidia-smi` fails: `sudo systemctl restart nvidia-persistenced`
- If that fails: `sudo modprobe -r nvidia_uvm && sudo modprobe nvidia_uvm`
- Nuclear option: reboot

---

### DNS / volume-resolver Issues

**Subdomain not resolving after registration**
- Check volume-resolver container is running: `docker ps | grep volume-resolver`
- Check zone file was updated for the TLD
- Reload BIND zones: `docker exec volume-resolver rndc reload`
- Test directly: `dig @localhost -p 5300 subdomain.tld A`
- Check BIND logs: `docker exec volume-resolver tail -20 /var/log/named/default.log`

**NXDOMAIN for valid subdomain**
- Zone file may not have been reloaded after record addition
- Fix: `docker exec volume-resolver rndc reload <tld>`
- Check zone file syntax: `docker exec volume-resolver named-checkzone <tld> /path/to/zone`

**SERVFAIL responses**
- If own zones work but Handshake TLDs fail: check hsd `no-sig0: true` in `/home/localai/.hsd/hsd.conf`
- Check hsd is running: `pm2 status halcyon-hsd`
- Check UFW allows container → hsd: `sudo ufw status | grep 5349`
- Check root_proxy inside container: `docker exec volume-resolver ps aux | grep root_proxy`
- If hsd was restarted, restart volume-resolver too: container caches root_proxy connections

**DoH not working**
- Check Caddy: `sudo systemctl status caddy`
- Check dnsdist inside container: `docker exec volume-resolver dnsdist -e 'showServers()'`
- Test wire format: `curl -s -H 'content-type: application/dns-message' 'https://dns.halcyon-names.io/dns-query?dns=AAABAAABAAAAAAAAA3d3dwl0ZXN0em9uZQAAAAEAAQ'`
- Test JSON API: `curl -s 'https://dns.halcyon-names.io/resolve?name=www.testzone&type=A'`

---

### Handshake Node Issues

**hsd not syncing**
- Check peer count: `hsd-cli rpc getpeerinfo | jq length`
- If 0 peers: check firewall allows port 12038 (mainnet) or 13038 (testnet)
- Check disk space: `df -h` — hsd chain data grows over time
- Restart: `sudo systemctl restart hsd`

**Name lookup fails**
- Node might not be fully synced: `hsd-cli rpc getblockchaininfo`
- Compare block height with a Handshake explorer

---

### Flare / Smart Contract Issues

**Transaction reverts with no reason**
- Likely: insufficient FLR for gas, or contract paused
- Check balance: `ethers.provider.getBalance(address)`
- Try with higher gas limit
- Read contract state to check if paused or locked

**Event listener misses events**
- ethers.js WebSocket can silently disconnect
- Implement reconnection logic with exponential backoff
- Consider polling as fallback: `contract.queryFilter(event, fromBlock, toBlock)`

**FTSO price returns 0**
- On Coston2: use `ContractRegistry.getTestFtsoV2()` (free, no fees)
- On mainnet: use `ContractRegistry.getFtsoV2()` + check `IFeeCalculator` for required fees
- Block-latency feeds update every ~1.8s, anchor feeds every ~90s
- Use `getFeedByIdInWei()` for 18-decimal precision (simpler math)
- Fallback to CoinGecko API if FTSO unavailable
- Check FTSO registry for supported feed IDs

---

### Database Issues

**Migration fails**
- Check PostgreSQL logs: `sudo journalctl -u postgresql -n 50`
- Common cause: trying to add NOT NULL column without default to table with existing data
- Fix: add with default, or make nullable first

**Slow queries**
- Check for missing indexes on: `name` (records), `domain_id` (records), `owner_address`, `token_id`
- Use `EXPLAIN ANALYZE` to diagnose

---

### General

**Port already in use**
```bash
# Find what's using a port
lsof -i :PORT_NUMBER
# Kill it
kill -9 $(lsof -t -i:PORT_NUMBER)
```

**Node.js memory issues**
```bash
# Increase heap size
export NODE_OPTIONS="--max-old-space-size=4096"
```

---

## Adding New Issues

When you encounter and fix a new issue, add it here with:
1. **Symptom** — what you saw
2. **Cause** — what was actually wrong
3. **Fix** — what solved it
4. **Prevention** — how to avoid it in the future (if applicable)
