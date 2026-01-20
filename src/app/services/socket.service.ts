import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface AlertEvent {
  actionType: 'entry' | 'exit';
  zone: string;
  site: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface LiveOccupancyEvent {
  zone?: string;
  floor?: string;
  site: string;
  occupancy: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private authService = inject(AuthService);
  private socket: Socket | null = null;
  private readonly SOCKET_URL = 'https://hiring-dev.internal.kloudspot.com';

  connect(): void {
    // Prevent multiple connections
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      console.error('Cannot connect socket: No authentication token');
      return;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.SOCKET_URL, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // Auto-reconnect on unexpected disconnects
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onAlert(): Observable<AlertEvent> {
    return new Observable(observer => {
      if (!this.socket) {
        this.connect();
      }

      this.socket?.on('alert', (data: AlertEvent) => {
        observer.next(data);
      });

      return () => {
        this.socket?.off('alert');
      };
    });
  }

  onLiveOccupancy(): Observable<LiveOccupancyEvent> {
    return new Observable(observer => {
      if (!this.socket) {
        this.connect();
      }

      this.socket?.on('liveOccupancy', (data: LiveOccupancyEvent) => {
        observer.next(data);
      });

      return () => {
        this.socket?.off('liveOccupancy');
      };
    });
  }
}
