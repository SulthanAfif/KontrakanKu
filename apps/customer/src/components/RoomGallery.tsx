import { useRef, useState, type ReactNode, type TouchEvent } from "react";

type RoomGalleryProps = {
  photos: string[] | null;
  className: string;
  alt: string;
  children?: ReactNode;
};

export function RoomGallery({ photos, className, alt, children }: RoomGalleryProps) {
  const images = (photos ?? []).filter(Boolean);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const safeIndex = images.length ? activeIndex % images.length : 0;

  function move(direction: number) {
    setActiveIndex((index) => (index + direction + images.length) % images.length);
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || images.length < 2) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
    touchStartX.current = null;
  }

  return (
    <div
      className={`room-gallery ${className}`}
      role="group"
      onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
      onTouchEnd={handleTouchEnd}
      aria-label={images.length > 1 ? `${alt}, foto ${safeIndex + 1} dari ${images.length}` : alt}
    >
      {images.length ? <img key={images[safeIndex]} className="gallery-image" src={images[safeIndex]} alt={alt} /> : <div className="gallery-placeholder" aria-hidden="true"><span>⌂</span><small>Foto segera hadir</small></div>}
      {children}
      {images.length > 1 ? <>
        <button className="gallery-arrow gallery-prev" type="button" aria-label="Foto sebelumnya" onClick={() => move(-1)}>‹</button>
        <button className="gallery-arrow gallery-next" type="button" aria-label="Foto berikutnya" onClick={() => move(1)}>›</button>
        <div className="gallery-dots" aria-label={`Foto ${safeIndex + 1} dari ${images.length}`}>
          {images.map((_, index) => <button key={index} type="button" className={`gallery-dot${index === safeIndex ? " gallery-dot-active" : ""}`} aria-label={`Tampilkan foto ${index + 1}`} aria-current={index === safeIndex} onClick={() => setActiveIndex(index)} />)}
        </div>
      </> : null}
    </div>
  );
}
