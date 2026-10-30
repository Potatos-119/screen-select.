import struct, zlib
def png(size):
    bg=(32,36,48); fg=(255,255,255)
    rows=[]
    m=max(2,size//6); dash=max(2,size//8); t=max(1,size//12)
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            on_h=(m<=x<size-m) and (m<=y<m+t or size-m-t<=y<size-m)
            on_v=(m<=y<size-m) and (m<=x<m+t or size-m-t<=x<size-m)
            draw=(on_h and (x//dash)%2==0) or (on_v and (y//dash)%2==0)
            row+=bytes(fg if draw else bg)
        rows.append(bytes(row))
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
for s in (16,48,128): open(f'extension/icons/icon{s}.png','wb').write(png(s))
