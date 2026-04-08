import { PiArrowLeft } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import Button from '../primitives/Button';

export default function BackButton({ to, children = 'Volver', onClick, className }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    if (to) {
      navigate(to);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/dashboard');
  };

  return (
    <Button type="button" variant="primary" className={className} onClick={handleClick}>
      <PiArrowLeft className="text-base" />
      <span className="pl-1">{children}</span>
    </Button>
  );
}
