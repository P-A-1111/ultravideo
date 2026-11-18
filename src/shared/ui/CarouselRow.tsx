import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type CSSProperties, type ReactNode } from "react";

interface Props {
  title: string;
  hint?: string;
  index?: number;
  children: ReactNode;
}

export function CarouselRow({ title, hint, index = 0, children }: Props) {
  const track = useRef<HTMLDivElement>(null);

  function scrollByPage(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.85,
      behavior: "smooth",
    });
  }

  return (
    <section className="row animate-in" style={{ "--i": index } as CSSProperties}>
      <div className="row-head">
        <h2>{title}</h2>
        <div className="row-tools">
          {hint && <small>{hint}</small>}
          <button className="row-arrow" onClick={() => scrollByPage(-1)} aria-label="Anterior">
            <ChevronLeft size={17} />
          </button>
          <button className="row-arrow" onClick={() => scrollByPage(1)} aria-label="Próximo">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="carousel" ref={track}>
        {children}
      </div>
    </section>
  );
}
