import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ImageUp, BrainCog, Copy } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

interface TextSelectionControlsProps {
  text: string;
  onSearch: (text: string) => Promise<void>;
}

export default function TextSelectionControls({
  text,
  onSearch,
}: TextSelectionControlsProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (text) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setPosition({
          top: rect.top - 40,
          left: rect.left,
        });
        setIsVisible(true);
      }
    } else {
      setIsVisible(false);
    }
  }, [text]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = async () => {
    await onSearch(text);
    setIsVisible(false);
  };

  // Google API機能のみを使用するため、ChatGPT機能は削除されました
  // const handleChatGPT = () => {
  //   window.dispatchEvent(new CustomEvent('ask-chatgpt', { detail: { text } }));
  //   setIsVisible(false);
  // };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'コピー完了',
      description: 'テキストがクリップボードにコピーされました',
      duration: 2000,
    });
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={controlsRef}
      className='fixed bg-white shadow-lg rounded-lg border border-neutral-200 p-2 z-10'
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className='flex items-center'>
        <Button
          variant='ghost'
          size='icon'
          className='p-1 hover:bg-neutral-100 rounded mr-1'
          title='画像検索'
          onClick={handleSearch}
        >
          <ImageUp className='h-5 w-5 text-primary' />
        </Button>
        {/* Google API機能のみを使用するため、ChatGPT機能は削除されました */}
        {/* <Button
          variant='ghost'
          size='icon'
          className='p-1 hover:bg-neutral-100 rounded mr-1'
          title='AIに質問'
          onClick={handleChatGPT}
        >
          <BrainCog className='h-5 w-5 text-primary' />
        </Button> */}
        <Button
          variant='ghost'
          size='icon'
          className='p-1 hover:bg-neutral-100 rounded'
          title='コピー'
          onClick={handleCopy}
        >
          <Copy className='h-5 w-5 text-primary' />
        </Button>
      </div>
    </div>
  );
}
