import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { syncStudentColorMode } from '../../utils/studentColorMode';

const StudentColorModeSync = () => {
  const location = useLocation();

  useEffect(() => {
    syncStudentColorMode(location.pathname);
  }, [location.pathname]);

  return null;
};

export default StudentColorModeSync;
