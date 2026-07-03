import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageSliderProps {
  images: string[];
  interval?: number;
  className?: string;
  imageClassName?: string;
}

export function ImageSlider({ images, interval = 5000, className = "", imageClassName = "" }: ImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!images || images.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, interval);

    return () => clearInterval(timer);
  }, [images, interval]);

  if (!images || images.length === 0) {
    return null;
  }

  // If there's only one image, just render it without the AnimatePresence overhead
  if (images.length === 1) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        <img 
          src={images[0]} 
          alt="Slide" 
          className={`absolute inset-0 w-full h-full object-cover ${imageClassName}`} 
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <AnimatePresence initial={false}>
        <motion.img
          key={currentIndex}
          src={images[currentIndex]}
          alt={`Slide ${currentIndex + 1}`}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className={`absolute inset-0 w-full h-full object-cover ${imageClassName}`}
        />
      </AnimatePresence>
      
    </div>
  );
}
