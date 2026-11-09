import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { UsuarioSistema } from '../types';

interface AuthContextType {
  user: User | null;
  usuarioSistema: UsuarioSistema | null;
  isAdmin: boolean;
  isLoading: boolean;
  usuariosSistema: UsuarioSistema[];
  loginComGoogle: () => Promise<{ success: boolean; message?: string }>;
  loginComCredenciais: (email: string, senha: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  cadastrarUsuarioSistema: (novo: Omit<UsuarioSistema, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  atualizarUsuarioSistema: (id: string, dados: Partial<UsuarioSistema>) => Promise<{ success: boolean; message?: string }>;
  excluirUsuarioSistema: (id: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MASTER_EMAIL = 'administrativo@gmail.com';

const USUARIOS_DEFAULT: UsuarioSistema[] = [
  {
    id: 'user-admin-master',
    nome: 'Administrador Master',
    nomeLoja: 'Gradi Gestão',
    email: MASTER_EMAIL,
    senha: 'admin123',
    whatsapp: '11999999999',
    role: 'admin',
    status: 'ativo',
    createdAt: new Date().toISOString(),
    criadoPor: 'Sistema',
  },
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [usuarioSistema, setUsuarioSistema] = useState<UsuarioSistema | null>(() => {
    const saved = localStorage.getItem('gradi_usuario_ativo');
    if (saved) {
      try {
        const parsed: UsuarioSistema = JSON.parse(saved);
        if (parsed) {
          if (parsed.nomeLoja === 'Gradi Gestão Matriz' || parsed.nomeLoja.includes('Matriz')) {
            parsed.nomeLoja = 'Gradi Gestão';
          }
          if (parsed.email.toLowerCase() === 'softinsta8@gmail.com') {
            parsed.email = MASTER_EMAIL;
          }
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioSistema[]>(() => {
    const saved = localStorage.getItem('gradi_usuarios_sistema');
    if (saved) {
      try {
        let parsed: UsuarioSistema[] = JSON.parse(saved);
        parsed = parsed.map(u => {
          let updated = { ...u };
          if (updated.nomeLoja === 'Gradi Gestão Matriz' || updated.nomeLoja.includes('Matriz')) {
            updated.nomeLoja = 'Gradi Gestão';
          }
          if (updated.email.toLowerCase() === 'softinsta8@gmail.com') {
            updated.email = MASTER_EMAIL;
          }
          return updated;
        });
        const hasMaster = parsed.some(
          u => u.email.toLowerCase() === MASTER_EMAIL.toLowerCase()
        );
        if (!hasMaster) {
          return [USUARIOS_DEFAULT[0], ...parsed];
        }
        return parsed;
      } catch {
        return USUARIOS_DEFAULT;
      }
    }
    return USUARIOS_DEFAULT;
  });

  const [isLoading, setIsLoading] = useState(true);

  // Sincroniza lista local no localStorage
  useEffect(() => {
    localStorage.setItem('gradi_usuarios_sistema', JSON.stringify(usuariosSistema));
  }, [usuariosSistema]);

  useEffect(() => {
    if (usuarioSistema) {
      localStorage.setItem('gradi_usuario_ativo', JSON.stringify(usuarioSistema));
    } else {
      localStorage.removeItem('gradi_usuario_ativo');
    }
  }, [usuarioSistema]);

  // Listener do Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const emailLower = (firebaseUser.email || '').toLowerCase();
        const isMaster = emailLower === MASTER_EMAIL.toLowerCase();

        // Procura se já está cadastrado em usuariosSistema
        const cadastrado = usuariosSistema.find(u => u.email.toLowerCase() === emailLower);

        if (cadastrado) {
          setUsuarioSistema({
            ...cadastrado,
            uid: firebaseUser.uid,
            ultimoAcesso: new Date().toISOString(),
          });
        } else {
          // Cria o perfil do usuário logado
          const novoPerfil: UsuarioSistema = {
            id: `usr-${firebaseUser.uid}`,
            uid: firebaseUser.uid,
            nome: firebaseUser.displayName || 'Usuário Google',
            nomeLoja: isMaster ? 'Gradi Gestão' : 'Loja Parceira',
            email: firebaseUser.email || '',
            role: isMaster ? 'admin' : 'lojista',
            status: 'ativo',
            createdAt: new Date().toISOString(),
            criadoPor: isMaster ? 'Sistema' : MASTER_EMAIL,
            ultimoAcesso: new Date().toISOString(),
          };

          setUsuariosSistema(prev => {
            if (prev.some(u => u.email.toLowerCase() === emailLower)) return prev;
            return [...prev, novoPerfil];
          });
          setUsuarioSistema(novoPerfil);

          // Salva no Firestore se possível
          try {
            setDoc(doc(db, 'systemUsers', novoPerfil.id), novoPerfil);
          } catch (err) {
            console.warn('Erro ao salvar no Firestore:', err);
          }
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Tenta sincronizar com a coleção Firestore 'systemUsers'
  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'systemUsers');

    const unsub = onSnapshot(
      colRef,
      snapshot => {
        if (!snapshot.empty) {
          const docsData: UsuarioSistema[] = [];
          snapshot.forEach(d => {
            docsData.push(d.data() as UsuarioSistema);
          });
          setUsuariosSistema(prev => {
            // Mescla sem perder dados locais
            const mapa = new Map<string, UsuarioSistema>();
            prev.forEach(u => mapa.set(u.id, u));
            docsData.forEach(u => mapa.set(u.id, u));
            return Array.from(mapa.values());
          });
        }
      },
      err => {
        console.warn('Firestore snapshot error on systemUsers:', err);
      }
    );

    return () => unsub();
  }, [user]);

  const isAdmin = Boolean(
    (user?.email && user.email.toLowerCase() === MASTER_EMAIL.toLowerCase()) ||
      usuarioSistema?.role === 'admin'
  );

  // 1. Login com Google (Firebase Auth oficial)
  const loginComGoogle = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      setIsLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const emailLower = (result.user.email || '').toLowerCase();
      const isMaster = emailLower === MASTER_EMAIL.toLowerCase();

      // Procura ou cria
      const existente = usuariosSistema.find(u => u.email.toLowerCase() === emailLower);

      if (existente && existente.status === 'suspenso') {
        await fbSignOut(auth);
        setUsuarioSistema(null);
        return { success: false, message: 'Seu acesso a este sistema foi suspenso pelo administrador.' };
      }

      const perfilAtivo: UsuarioSistema = existente || {
        id: `usr-${result.user.uid}`,
        uid: result.user.uid,
        nome: result.user.displayName || 'Usuário Google',
        nomeLoja: isMaster ? 'Gradi Gestão' : 'Minha Loja',
        email: result.user.email || '',
        role: isMaster ? 'admin' : 'lojista',
        status: 'ativo',
        createdAt: new Date().toISOString(),
        criadoPor: isMaster ? 'Sistema' : MASTER_EMAIL,
        ultimoAcesso: new Date().toISOString(),
      };

      setUsuarioSistema(perfilAtivo);
      return { success: true };
    } catch (err: unknown) {
      console.error('Erro no login com Google:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Falha ao autenticar com o Google.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Login com E-mail e Senha de Cliente/Lojista cadastrado ou Administrador
  const loginComCredenciais = async (
    email: string,
    senha: string
  ): Promise<{ success: boolean; message?: string }> => {
    const e = email.trim().toLowerCase();
    const s = senha.trim();

    const isMasterLogin =
      e === MASTER_EMAIL.toLowerCase() ||
      e === 'admin' ||
      e === 'adm' ||
      e === 'administrativo' ||
      e === 'administrativo@gradi.com' ||
      e === 'admin@gradi.com';

    let encontrado = usuariosSistema.find(
      u =>
        u.email.toLowerCase() === e ||
        (isMasterLogin && u.email.toLowerCase() === MASTER_EMAIL.toLowerCase())
    );

    // Se for o login do Administrador Master e ainda não existir na lista, inicializa
    if (isMasterLogin && !encontrado) {
      encontrado = {
        id: 'user-admin-master',
        nome: 'Administrador Master',
        nomeLoja: 'Gradi Gestão',
        email: MASTER_EMAIL,
        senha: 'admin123',
        whatsapp: '11999999999',
        role: 'admin',
        status: 'ativo',
        createdAt: new Date().toISOString(),
        criadoPor: 'Sistema',
      };
      setUsuariosSistema(prev => [encontrado!, ...prev]);
    }

    if (!encontrado) {
      return {
        success: false,
        message: 'E-mail não encontrado. Peça ao administrador para cadastrar seu acesso.',
      };
    }

    if (encontrado.status === 'suspenso') {
      return {
        success: false,
        message: 'Acesso suspenso. Entre em contato com o suporte/administrador.',
      };
    }

    // Se for o admin master, aceita a senha salva ou as senhas padrão 'admin123' / 'admin' / 'administrativo'
    if (isMasterLogin) {
      const senhaValida =
        s === encontrado.senha ||
        s === 'admin123' ||
        s === 'admin' ||
        s === 'administrativo';
      if (!senhaValida) {
        return {
          success: false,
          message: 'Senha incorreta para o Administrador.',
        };
      }
    } else {
      // Se a senha foi configurada pelo admin
      if (encontrado.senha && encontrado.senha !== s) {
        return {
          success: false,
          message: 'Senha incorreta. Verifique suas credenciais.',
        };
      }
    }

    const perfilAtualizado: UsuarioSistema = {
      ...encontrado,
      nomeLoja:
        encontrado.nomeLoja === 'Gradi Gestão Matriz' || encontrado.nomeLoja.includes('Matriz')
          ? 'Gradi Gestão'
          : encontrado.nomeLoja,
      ultimoAcesso: new Date().toISOString(),
    };

    setUsuarioSistema(perfilAtualizado);

    try {
      setDoc(doc(db, 'systemUsers', perfilAtualizado.id), perfilAtualizado, { merge: true }).catch(() => {});
    } catch (err) {
      console.warn('Erro ao salvar no Firestore:', err);
    }

    return { success: true };
  };

  // 3. Logout
  const logout = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Erro ao deslogar do Firebase:', err);
    }
    setUsuarioSistema(null);
    setUser(null);
    localStorage.removeItem('gradi_usuario_ativo');
  };

  // 4. Cadastrar Novo Usuário / Cliente do Sistema
  const cadastrarUsuarioSistema = async (
    novo: Omit<UsuarioSistema, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const emailLower = novo.email.trim().toLowerCase();

      if (usuariosSistema.some(u => u.email.toLowerCase() === emailLower)) {
        return { success: false, message: 'Já existe um cliente/usuário cadastrado com este e-mail.' };
      }

      const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const novoUsuario: UsuarioSistema = {
        ...novo,
        id,
        email: emailLower,
        createdAt: new Date().toISOString(),
        criadoPor: usuarioSistema?.email || MASTER_EMAIL,
      };

      setUsuariosSistema(prev => [novoUsuario, ...prev]);

      // Tenta persistir no Firestore
      try {
        await setDoc(doc(db, 'systemUsers', id), novoUsuario);
      } catch (err) {
        console.warn('Salvo localmente (Firestore sincronizará quando online):', err);
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Erro ao cadastrar usuário.',
      };
    }
  };

  // 5. Atualizar Usuário
  const atualizarUsuarioSistema = async (
    id: string,
    dados: Partial<UsuarioSistema>
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      setUsuariosSistema(prev =>
        prev.map(u => (u.id === id ? { ...u, ...dados } : u))
      );

      if (usuarioSistema?.id === id) {
        setUsuarioSistema(prev => (prev ? { ...prev, ...dados } : null));
      }

      try {
        await setDoc(doc(db, 'systemUsers', id), dados, { merge: true });
      } catch (err) {
        console.warn('Atualizado localmente:', err);
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Erro ao atualizar usuário.',
      };
    }
  };

  // 6. Excluir Usuário
  const excluirUsuarioSistema = async (id: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const u = usuariosSistema.find(item => item.id === id);
      if (u?.email.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
        return { success: false, message: 'Não é permitido excluir o Administrador Master do sistema.' };
      }

      setUsuariosSistema(prev => prev.filter(item => item.id !== id));

      try {
        await deleteDoc(doc(db, 'systemUsers', id));
      } catch (err) {
        console.warn('Excluído localmente:', err);
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Erro ao excluir usuário.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        usuarioSistema,
        isAdmin,
        isLoading,
        usuariosSistema,
        loginComGoogle,
        loginComCredenciais,
        logout,
        cadastrarUsuarioSistema,
        atualizarUsuarioSistema,
        excluirUsuarioSistema,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
