#!/usr/bin/env python3
"""
GPU Fan Control for HSR Generation
- Spins fans to 100% when GPU is under load
- Drops to 10% after 20 seconds of idle
"""

import subprocess
import time
import sys
import threading

# Configuration
FAN_HIGH = 100  # Fan speed during load
FAN_LOW = 10    # Fan speed when idle
IDLE_TIMEOUT = 20  # Seconds before dropping to low
POLL_INTERVAL = 2  # How often to check GPU utilization

# Track state
last_active_time = [time.time(), time.time(), time.time()]
current_fan_speed = [FAN_LOW, FAN_LOW, FAN_LOW]
running = True


def get_gpu_utilization():
    """Get utilization for all GPUs"""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        utils = [int(x.strip()) for x in result.stdout.strip().split('\n')]
        return utils
    except Exception as e:
        print(f"Error getting GPU utilization: {e}")
        return [0, 0, 0]


def set_fan_speed(gpu_idx, speed):
    """Set fan speed for a specific GPU"""
    global current_fan_speed

    if current_fan_speed[gpu_idx] == speed:
        return  # Already at this speed

    try:
        # Each GPU typically has one fan (fan index = gpu index)
        cmd = f"nvidia-settings -a '[gpu:{gpu_idx}]/GPUFanControlState=1' -a '[fan:{gpu_idx}]/GPUTargetFanSpeed={speed}'"
        subprocess.run(cmd, shell=True, capture_output=True, timeout=5)
        current_fan_speed[gpu_idx] = speed
        return True
    except Exception as e:
        print(f"Error setting fan speed for GPU {gpu_idx}: {e}")
        return False


def set_all_fans(speed):
    """Set all GPU fans to the same speed"""
    for i in range(3):
        set_fan_speed(i, speed)


def fan_control_loop():
    """Main fan control loop"""
    global last_active_time, running

    print(f"GPU Fan Control Started")
    print(f"  High: {FAN_HIGH}% | Low: {FAN_LOW}% | Idle timeout: {IDLE_TIMEOUT}s")
    print("-" * 50)

    while running:
        try:
            utils = get_gpu_utilization()
            now = time.time()

            for i, util in enumerate(utils):
                if util > 5:  # GPU is active
                    last_active_time[i] = now
                    if current_fan_speed[i] != FAN_HIGH:
                        print(f"GPU{i}: Active ({util}%) -> Fans {FAN_HIGH}%")
                        set_fan_speed(i, FAN_HIGH)
                else:
                    idle_time = now - last_active_time[i]
                    if idle_time > IDLE_TIMEOUT and current_fan_speed[i] != FAN_LOW:
                        print(f"GPU{i}: Idle {idle_time:.0f}s -> Fans {FAN_LOW}%")
                        set_fan_speed(i, FAN_LOW)

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error in fan control loop: {e}")
            time.sleep(5)

    # Reset to auto on exit
    print("\nResetting fans to auto control...")
    for i in range(3):
        try:
            subprocess.run(f"nvidia-settings -a '[gpu:{i}]/GPUFanControlState=0'",
                         shell=True, capture_output=True)
        except:
            pass


def start_background():
    """Start fan control in background thread"""
    global running
    running = True
    thread = threading.Thread(target=fan_control_loop, daemon=True)
    thread.start()
    return thread


def stop():
    """Stop fan control"""
    global running
    running = False


def fans_high():
    """Set all fans to high immediately"""
    set_all_fans(FAN_HIGH)


def fans_low():
    """Set all fans to low immediately"""
    set_all_fans(FAN_LOW)


def fans_auto():
    """Reset fans to automatic control"""
    for i in range(3):
        try:
            subprocess.run(f"nvidia-settings -a '[gpu:{i}]/GPUFanControlState=0'",
                         shell=True, capture_output=True)
        except:
            pass
    print("Fans reset to automatic control")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "high":
            fans_high()
            print("All fans set to 100%")
        elif cmd == "low":
            fans_low()
            print("All fans set to 10%")
        elif cmd == "auto":
            fans_auto()
        elif cmd == "status":
            utils = get_gpu_utilization()
            for i, u in enumerate(utils):
                print(f"GPU{i}: {u}% utilization, fan at {current_fan_speed[i]}%")
        else:
            print("Usage: gpu_fan_control.py [high|low|auto|status]")
            print("       Run without args for automatic control loop")
    else:
        try:
            fan_control_loop()
        except KeyboardInterrupt:
            print("\nStopping...")
            fans_auto()
