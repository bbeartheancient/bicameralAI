#!/usr/bin/env python3
"""
EEG Bridge Server — WebSocket bridge for custom 8-channel EEG hardware.

Reads from your hardware interface (serial, SPI, USB, etc.) and streams
8-channel frames to the Octonion EEG Spatializer browser app via WebSocket.

Usage:
    pip install websockets pyserial
    python eeg_bridge_server.py

    Then in the browser app, click "WebSocket" and connect to localhost:8765

Protocol:
    Each WebSocket message is a JSON object:
    {
        "channels": [ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7],
        "timestamp": 1234567890123
    }

    Channel order: F3, F4, C3, CZ, C4, P3, PZ, P4
"""

import asyncio
import json
import time
import math
import argparse

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    exit(1)

# ============================================================
# HARDWARE INTERFACE — MODIFY THIS FOR YOUR DEVICE
# ============================================================

class HardwareInterface:
    """
    Base class for reading 8-channel EEG data from your hardware.
    Override the methods below for your specific device.
    """

    def __init__(self):
        self.sample_rate = 256  # Hz
        self.num_channels = 8
        # Channel order: F3, F4, C3, CZ, C4, P3, PZ, P4

    async def connect(self):
        """Initialize connection to your hardware."""
        print(f"[Hardware] Connected (simulated @ {self.sample_rate} Hz)")

    async def read_frame(self):
        """
        Read one frame of 8 channel values from hardware.
        Returns: list of 8 float values, or None if no data.

        MODIFY THIS METHOD for your specific hardware.
        """
        # === SIMULATED DATA (replace with your hardware read) ===
        t = time.time()
        frame = []
        freqs = [8, 10, 12, 9, 11, 7, 13, 8.5]  # Alpha-band
        for ch in range(8):
            val = math.sin(2 * math.pi * freqs[ch] * t + ch * 0.5)
            val += 0.3 * math.sin(2 * math.pi * freqs[ch] * 2 * t)
            val += 0.05 * (hash(str(t * 1000 + ch)) % 100 - 50) / 50  # noise
            frame.append(val * 50000 + 50000)  # Scale to ~uV range
        return frame

    async def disconnect(self):
        """Clean up hardware connection."""
        print("[Hardware] Disconnected")


class SerialHardware(HardwareInterface):
    """
    Read from a USB serial port.
    Expects: 8 comma-separated values per line, e.g.:
        49271.5,49957.8,49644.2,48953.2,49147.9,49888.3,...\n
    """

    def __init__(self, port='/dev/ttyUSB0', baud=115200):
        super().__init__()
        self.port = port
        self.baud = baud
        self.serial = None

    async def connect(self):
        try:
            import serial
        except ImportError:
            print("Install pyserial: pip install pyserial")
            exit(1)

        self.serial = serial.Serial(self.port, self.baud, timeout=0.1)
        print(f"[Serial] Connected to {self.port} @ {self.baud} baud")

    async def read_frame(self):
        if not self.serial or not self.serial.in_waiting:
            await asyncio.sleep(1 / self.sample_rate)
            return None

        line = self.serial.readline().decode('ascii', errors='ignore').strip()
        if not line:
            return None

        parts = line.split(',')
        if len(parts) >= 8:
            try:
                return [float(p) for p in parts[:8]]
            except ValueError:
                return None
        return None

    async def disconnect(self):
        if self.serial:
            self.serial.close()
        print("[Serial] Disconnected")


# ============================================================
# WEBSOCKET SERVER
# ============================================================

connected_clients = set()
hardware = None


async def handler(websocket, path=None):
    """Handle a WebSocket client connection."""
    connected_clients.add(websocket)
    client_id = id(websocket)
    print(f"[WS] Client {client_id} connected ({len(connected_clients)} total)")

    try:
        # Keep connection alive, listen for any control messages
        async for message in websocket:
            try:
                cmd = json.loads(message)
                if cmd.get('type') == 'ping':
                    await websocket.send(json.dumps({'type': 'pong'}))
                elif cmd.get('type') == 'config':
                    print(f"[WS] Client config: {cmd}")
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[WS] Client {client_id} disconnected ({len(connected_clients)} total)")


async def broadcast_loop():
    """Read from hardware and broadcast to all connected clients."""
    global hardware

    await hardware.connect()

    frame_interval = 1.0 / hardware.sample_rate
    frame_count = 0
    last_log_time = time.time()

    try:
        while True:
            frame = await hardware.read_frame()

            if frame is not None and connected_clients:
                message = json.dumps({
                    'channels': frame,
                    'timestamp': int(time.time() * 1000),
                    'frame': frame_count
                })

                # Broadcast to all clients
                disconnected = set()
                for client in connected_clients:
                    try:
                        await client.send(message)
                    except websockets.exceptions.ConnectionClosed:
                        disconnected.add(client)
                connected_clients -= disconnected

                frame_count += 1

            # Log throughput
            now = time.time()
            if now - last_log_time >= 5.0:
                rate = frame_count / (now - last_log_time) if frame_count > 0 else 0
                if connected_clients:
                    print(f"[Stream] {rate:.1f} sps → {len(connected_clients)} client(s)")
                frame_count = 0
                last_log_time = now

            # Rate limiting
            if frame is None:
                await asyncio.sleep(frame_interval)
            else:
                await asyncio.sleep(frame_interval * 0.9)  # Slight undercount for timing jitter

    except asyncio.CancelledError:
        pass
    finally:
        await hardware.disconnect()


async def main(args):
    global hardware

    # Select hardware interface
    if args.serial:
        hardware = SerialHardware(port=args.serial, baud=args.baud)
    else:
        hardware = HardwareInterface()  # Simulated
        print("[Mode] Using simulated EEG data (use --serial PORT for real hardware)")

    print(f"[Server] Starting WebSocket server on ws://localhost:{args.port}")
    print(f"[Server] Open eeg-spatializer.html, click 'WebSocket', connect to localhost:{args.port}")
    print()

    # Start WebSocket server + broadcast loop
    async with websockets.serve(handler, "0.0.0.0", args.port):
        await broadcast_loop()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='EEG WebSocket Bridge Server')
    parser.add_argument('--port', type=int, default=8765, help='WebSocket port (default: 8765)')
    parser.add_argument('--serial', type=str, default=None,
                        help='Serial port path (e.g., /dev/ttyUSB0, COM3). Omit for simulated data.')
    parser.add_argument('--baud', type=int, default=115200, help='Serial baud rate (default: 115200)')
    args = parser.parse_args()

    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        print("\n[Server] Shutting down")
